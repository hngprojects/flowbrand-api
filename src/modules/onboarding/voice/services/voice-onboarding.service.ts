import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../../redis/redis.service';
import { redisKeys } from '../../../../constants/redis-keys';
import { UPLOAD_OBJECT_STORAGE, UploadDocumentStatus, type ObjectStorage } from '../../../upload/upload.types';
import { UploadedDocumentModelAction } from '../../../upload/actions/uploaded-document.action';
import { VoiceTranscriptionJobData } from '../interfaces/voice-onboarding.interfaces';

@Injectable()
export class VoiceOnboardingService {
  constructor(
    @InjectQueue('voice-transcription') private readonly transcriptionQueue: Queue<VoiceTranscriptionJobData>,
    private readonly redisService: RedisService,
    @Inject(UPLOAD_OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    private readonly documentAction: UploadedDocumentModelAction,
  ) {}

  async handleAudioUpload(userId: string, file: Express.Multer.File, existingSessionId?: string): Promise<string> {
    const sessionId = existingSessionId || randomUUID();
    const storagePath = `voice-onboarding/${userId}/${randomUUID()}`;

    const metaKey = redisKeys.voiceSessionMeta(userId, sessionId);

    // Ensure session validity if providing an existing one
    if (existingSessionId) {
      const exists = await this.redisService.exists(metaKey);
      if (!exists) {
        throw new NotFoundException('SESSION_EXPIRED');
      }
    }

    // Upload to MinIO/S3
    await this.objectStorage.putObject({
      storagePath,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    // Enqueue transcription job
    await this.transcriptionQueue.add(
      {
        userId,
        voiceSessionId: sessionId,
        storagePath,
        mimeType: file.mimetype,
        originalName: file.originalname,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    // Update meta tracking only after successful enqueue
    await this.redisService.hincrby(metaKey, 'expectedCount', 1);
    await this.redisService.expire(metaKey, 1800);

    return sessionId;
  }

  async completeSession(userId: string, sessionId: string): Promise<string> {
    const sessionKey = redisKeys.voiceSession(userId, sessionId);
    const metaKey = redisKeys.voiceSessionMeta(userId, sessionId);
    const exists = await this.redisService.exists(metaKey);
    
    if (!exists) {
      throw new NotFoundException('SESSION_EXPIRED');
    }

    const meta = await this.redisService.hgetall(metaKey);
    const expectedCount = parseInt(meta.expectedCount || '0', 10);
    const completedCount = parseInt(meta.completedCount || '0', 10);

    if (expectedCount === 0 || expectedCount !== completedCount) {
      throw new BadRequestException('TRANSCRIPTION_INCOMPLETE');
    }

    const transcripts = await this.redisService.lrange(sessionKey, 0, -1);
    if (transcripts.length === 0) {
      throw new BadRequestException('TRANSCRIPTION_EMPTY');
    }

    const combinedTranscript = transcripts.join(' ');

    const document = await this.documentAction.createDocument({
      user_id: userId,
      file_name: `Voice Onboarding - ${new Date().toISOString()}`,
      file_size_bytes: String(Buffer.byteLength(combinedTranscript, 'utf-8')),
      file_type: 'doc', // Fallback type as it's not a real file
      status: UploadDocumentStatus.READY,
      percent_complete: 100,
      storage_path: 'voice-onboarding-virtual',
      source_type: 'voice',
      parsed_text: combinedTranscript,
    });

    await this.redisService.del(sessionKey);
    await this.redisService.del(metaKey);

    return document.id;
  }

  async getSessionStatus(userId: string, sessionId: string): Promise<{ expectedCount: number; completedCount: number; isReady: boolean }> {
    const metaKey = redisKeys.voiceSessionMeta(userId, sessionId);
    const exists = await this.redisService.exists(metaKey);

    if (!exists) {
      throw new NotFoundException('SESSION_EXPIRED');
    }

    const meta = await this.redisService.hgetall(metaKey);
    const expectedCount = parseInt(meta.expectedCount || '0', 10);
    const completedCount = parseInt(meta.completedCount || '0', 10);

    return {
      expectedCount,
      completedCount,
      isReady: expectedCount > 0 && expectedCount === completedCount,
    };
  }
}