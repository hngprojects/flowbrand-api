import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VoiceOnboardingController } from '../controllers/voice-onboarding.controller';
import { VoiceOnboardingService } from '../services/voice-onboarding.service';
import * as SYS_MSG from '../../../../constants/system.messages';
import { CompleteVoiceSessionDto } from '../dto/voice-onboarding.dto';

describe('VoiceOnboardingController', () => {
  let controller: VoiceOnboardingController;

  const mockVoiceOnboardingService = {
    handleAudioUpload: jest.fn(),
    completeSession: jest.fn(),
    getSessionStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceOnboardingController],
      providers: [
        {
          provide: VoiceOnboardingService,
          useValue: mockVoiceOnboardingService,
        },
      ],
    }).compile();

    controller = module.get<VoiceOnboardingController>(VoiceOnboardingController);
  });

  describe('uploadVoiceRound', () => {
    it('should successfully handle audio upload and return correct response', async () => {
      const mockUserId = 'user-123';
      const mockSessionId = 'session-456';
      const mockFile = {
        buffer: Buffer.from('test-audio'),
        mimetype: 'audio/webm',
        size: 1024,
      } as Express.Multer.File;

      mockVoiceOnboardingService.handleAudioUpload.mockResolvedValue(mockSessionId);

      const result = await controller.uploadVoiceRound(mockUserId, mockFile, undefined);

      expect(mockVoiceOnboardingService.handleAudioUpload).toHaveBeenCalledWith(mockUserId, mockFile, undefined);
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.VOICE_UPLOAD_ACCEPTED,
        data: {
          voiceSessionId: mockSessionId,
          status: 'processing',
        },
      });
    });

    it('should handle audio upload with an existing session ID', async () => {
      const mockUserId = 'user-123';
      const mockSessionId = 'existing-session-456';
      const mockFile = {
        buffer: Buffer.from('test-audio'),
        mimetype: 'audio/webm',
        size: 1024,
      } as Express.Multer.File;

      mockVoiceOnboardingService.handleAudioUpload.mockResolvedValue(mockSessionId);

      const result = await controller.uploadVoiceRound(mockUserId, mockFile, mockSessionId);

      expect(mockVoiceOnboardingService.handleAudioUpload).toHaveBeenCalledWith(mockUserId, mockFile, mockSessionId);
      expect(result.data.voiceSessionId).toBe(mockSessionId);
    });
  });

  describe('completeVoiceSession', () => {
    it('should successfully complete the voice session and return the upload ID', async () => {
      const mockUserId = 'user-123';
      const mockUploadId = 'upload-789';
      const mockDto: CompleteVoiceSessionDto = {
        voiceSessionId: 'session-456',
      };

      mockVoiceOnboardingService.completeSession.mockResolvedValue(mockUploadId);

      const result = await controller.completeVoiceSession(mockUserId, mockDto);

      expect(mockVoiceOnboardingService.completeSession).toHaveBeenCalledWith(mockUserId, mockDto.voiceSessionId);
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.VOICE_SESSION_COMPLETED,
        data: {
          upload_id: mockUploadId,
        },
      });
    });
  });

  describe('getVoiceSessionStatus', () => {
    it('should retrieve status and compute correctly formatted response', async () => {
      const mockSessionId = 'session-456';
      
      mockVoiceOnboardingService.getSessionStatus.mockResolvedValue({
        expectedCount: 3,
        completedCount: 3,
        isReady: true,
      });

      const result = await controller.getVoiceSessionStatus(mockSessionId);

      expect(mockVoiceOnboardingService.getSessionStatus).toHaveBeenCalledWith(mockSessionId);
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: 'Status retrieved successfully',
        data: {
          expectedCount: 3,
          completedCount: 3,
          isReady: true,
        },
      });
    });
  });
});
