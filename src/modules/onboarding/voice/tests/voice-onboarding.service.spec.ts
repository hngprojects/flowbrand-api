import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VoiceOnboardingService } from '../services/voice-onboarding.service';
import { RedisService } from '../../../redis/redis.service';
import { UPLOAD_OBJECT_STORAGE, UploadDocumentStatus } from '../../../upload/upload.types';
import { DocumentSourceType } from '../../../upload/entities/uploaded-document.entity';
import { UploadedDocumentModelAction } from '../../../upload/actions/uploaded-document.action';
import { redisKeys } from '../../../../constants/redis-keys';

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'mocked-uuid'),
}));

describe('VoiceOnboardingService', () => {
  let service: VoiceOnboardingService;

  const mockQueue = {
    add: jest.fn(),
  };

  const mockRedisService = {
    exists: jest.fn(),
    get: jest.fn(),
    setStrict: jest.fn(),
    lpush: jest.fn(),
    lpop: jest.fn(),
    expire: jest.fn(),
    hincrby: jest.fn(),
    lrange: jest.fn(),
    del: jest.fn(),
    hgetall: jest.fn(),
  };

  const mockObjectStorage = {
    putObject: jest.fn(),
  };

  const mockDocumentAction = {
    createDocument: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceOnboardingService,
        { provide: getQueueToken('voice-transcription'), useValue: mockQueue },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UPLOAD_OBJECT_STORAGE, useValue: mockObjectStorage },
        { provide: UploadedDocumentModelAction, useValue: mockDocumentAction },
      ],
    }).compile();

    service = module.get<VoiceOnboardingService>(VoiceOnboardingService);
  });

  describe('handleAudioUpload', () => {
    const mockUserId = 'user-123';
    const mockFile = {
      buffer: Buffer.from('test'),
      mimetype: 'audio/webm',
      size: 1024,
    } as Express.Multer.File;

    it('should initialize tracking, upload file, and queue job for a NEW session', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const sessionId = await service.handleAudioUpload(mockUserId, mockFile);

      expect(sessionId).toBe('mocked-uuid');

      // Verify list initialization
      const metaKey = redisKeys.voiceSessionMeta(mockUserId, 'mocked-uuid');

      // Verify object storage
      expect(mockObjectStorage.putObject).toHaveBeenCalledWith({
        storagePath: expect.stringContaining(`voice-onboarding/${mockUserId}/mocked-uuid`),
        body: mockFile.buffer,
        contentType: mockFile.mimetype,
        contentLength: mockFile.size,
      });

      // Verify Bull Queue
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          voiceSessionId: 'mocked-uuid',
          storagePath: `voice-onboarding/${mockUserId}/mocked-uuid`,
          mimeType: mockFile.mimetype,
          originalName: mockFile.originalname,
        },
        expect.objectContaining({ attempts: 3 }),
      );

      // Verify tracking after enqueue
      expect(mockRedisService.hincrby).toHaveBeenCalledWith(metaKey, 'expectedCount', 1);
      expect(mockRedisService.expire).toHaveBeenCalledWith(metaKey, 1800);
    });

    it('should append to an EXISTING session without initializing the list', async () => {
      const existingSessionId = 'existing-session-456';
      mockRedisService.exists.mockResolvedValue(true);

      const sessionId = await service.handleAudioUpload(mockUserId, mockFile, existingSessionId);

      expect(sessionId).toBe(existingSessionId);
      expect(mockRedisService.exists).toHaveBeenCalledWith(redisKeys.voiceSessionMeta(mockUserId, existingSessionId));
      expect(mockRedisService.lpush).not.toHaveBeenCalled();

      const metaKey = redisKeys.voiceSessionMeta(mockUserId, existingSessionId);
      expect(mockRedisService.hincrby).toHaveBeenCalledWith(metaKey, 'expectedCount', 1);
    });

    it('should throw NotFoundException if EXISTING session is expired/missing', async () => {
      mockRedisService.exists.mockResolvedValue(false);

      await expect(service.handleAudioUpload(mockUserId, mockFile, 'expired-session')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('completeSession', () => {
    const mockUserId = 'user-123';
    const mockSessionId = 'session-456';
    const sessionKey = redisKeys.voiceSession(mockUserId, mockSessionId);
    const metaKey = redisKeys.voiceSessionMeta(mockUserId, mockSessionId);

    it('should aggregate transcripts, create a document, and cleanup keys', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.hgetall.mockResolvedValue({
        expectedCount: '2',
        completedCount: '2',
      });
      mockRedisService.lrange.mockResolvedValue(['transcript 1.', 'transcript 2.']);
      mockDocumentAction.createDocument.mockResolvedValue({ id: 'doc-789' });

      const result = await service.completeSession(mockUserId, mockSessionId);

      expect(result).toBe('doc-789');
      expect(mockRedisService.lrange).toHaveBeenCalledWith(sessionKey, 0, -1);
      expect(mockDocumentAction.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          file_type: 'doc',
          status: UploadDocumentStatus.READY,
          percent_complete: 100,
          source_type: DocumentSourceType.VOICE,
          parsed_text: 'transcript 1. transcript 2.',
        }),
      );

      // Cleanup
      expect(mockRedisService.del).toHaveBeenCalledWith(sessionKey);
      expect(mockRedisService.del).toHaveBeenCalledWith(metaKey);
    });

    it('should throw BadRequestException if transcripts list is empty', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.hgetall.mockResolvedValue({
        expectedCount: '1',
        completedCount: '1',
      });
      mockRedisService.lrange.mockResolvedValue([]);

      await expect(service.completeSession(mockUserId, mockSessionId)).rejects.toThrow(BadRequestException);
      expect(mockDocumentAction.createDocument).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if session does not exist', async () => {
      mockRedisService.exists.mockResolvedValue(false);

      await expect(service.completeSession(mockUserId, mockSessionId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSessionStatus', () => {
    const mockUserId = 'user-123';
    const mockSessionId = 'session-456';

    it('should compute isReady as false if not all jobs are completed', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.hgetall.mockResolvedValue({
        expectedCount: '3',
        completedCount: '2',
      });

      const result = await service.getSessionStatus(mockUserId, mockSessionId);

      expect(result).toEqual({
        expectedCount: 3,
        completedCount: 2,
        isReady: false,
      });
    });

    it('should compute isReady as true if all jobs are completed and > 0', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.hgetall.mockResolvedValue({
        expectedCount: '3',
        completedCount: '3',
      });

      const result = await service.getSessionStatus(mockUserId, mockSessionId);

      expect(result).toEqual({
        expectedCount: 3,
        completedCount: 3,
        isReady: true,
      });
    });

    it('should compute isReady as false if 0 jobs are expected (e.g. tracking anomaly)', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.hgetall.mockResolvedValue({}); // defaults to 0

      const result = await service.getSessionStatus(mockUserId, mockSessionId);

      expect(result).toEqual({
        expectedCount: 0,
        completedCount: 0,
        isReady: false,
      });
    });

    it('should throw NotFoundException if meta tracking key does not exist', async () => {
      mockRedisService.exists.mockResolvedValue(false);

      await expect(service.getSessionStatus(mockUserId, mockSessionId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveSession', () => {
    const mockUserId = 'user-123';
    const mockSessionId = 'active-session-456';

    it('should return null if no active session key exists', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.getActiveSession(mockUserId);

      expect(mockRedisService.get).toHaveBeenCalledWith(redisKeys.activeVoiceSession(mockUserId));
      expect(result).toBeNull();
    });

    it('should return null and delete key if active session key exists but meta does not', async () => {
      mockRedisService.get.mockResolvedValue(mockSessionId);
      mockRedisService.exists.mockResolvedValue(false);

      const result = await service.getActiveSession(mockUserId);

      expect(mockRedisService.exists).toHaveBeenCalledWith(redisKeys.voiceSessionMeta(mockUserId, mockSessionId));
      expect(mockRedisService.del).toHaveBeenCalledWith(redisKeys.activeVoiceSession(mockUserId));
      expect(result).toBeNull();
    });

    it('should return sessionId if active session is fully valid', async () => {
      mockRedisService.get.mockResolvedValue(mockSessionId);
      mockRedisService.exists.mockResolvedValue(true);

      const result = await service.getActiveSession(mockUserId);

      expect(result).toBe(mockSessionId);
    });
  });
});
