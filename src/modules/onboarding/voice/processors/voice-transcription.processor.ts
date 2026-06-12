import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { UPLOAD_OBJECT_STORAGE, type ObjectStorage } from '../../../upload/upload.types';
import { VoiceTranscriptionService } from '../services/voice-transcription.service';
import { VoiceTranscriptionJobData } from '../interfaces/voice-onboarding.interfaces';
import { RedisService } from '../../../redis/redis.service';
import { redisKeys } from '../../../../constants/redis-keys';
import { QUEUES } from '../../../../common/constants/queue.constants';

@Processor(QUEUES.VOICE_TRANSCRIPTION)
export class VoiceTranscriptionProcessor {
  private readonly logger = new Logger(VoiceTranscriptionProcessor.name);

  constructor(
    @Inject(UPLOAD_OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    private readonly transcriptionService: VoiceTranscriptionService,
    private readonly redisService: RedisService,
  ) {}

  @Process()
  async processTranscription(job: Job<VoiceTranscriptionJobData>): Promise<void> {
    const { voiceSessionId, storagePath } = job.data;
    this.logger.debug(`Processing transcription for session: ${voiceSessionId}`);

    try {
      const audioBuffer = await this.objectStorage.getObject(storagePath);

      // Check idempotency guard before expensive transcribe call
      const idempotencyKey = `voice_job_processed:${job.id}`;
      if (await this.redisService.exists(idempotencyKey)) {
        this.logger.debug(`Job ${job.id} already processed, skipping redis updates.`);
        await this.objectStorage.deleteObject(storagePath);
        return;
      }
      
      const { transcript, provider } = await this.transcriptionService.transcribe(audioBuffer, job.data.originalName || 'audio.webm');
      this.logger.debug(`Transcription successful via ${provider} for session: ${voiceSessionId}`);

      // Append to Redis list and reset TTL
      const sessionKey = redisKeys.voiceSession(job.data.userId, voiceSessionId);
      
      await this.redisService.rpush(sessionKey, transcript);
      await this.redisService.expire(sessionKey, 1800); // 30 minutes TTL

      // Update completed count
      const metaKey = redisKeys.voiceSessionMeta(job.data.userId, voiceSessionId);
      
      if (await this.redisService.exists(metaKey)) {
        await this.redisService.hincrby(metaKey, 'completedCount', 1);
        await this.redisService.expire(metaKey, 1800);
      }

      await this.redisService.setStrict(idempotencyKey, '1', 1800);

      // Cleanup S3 audio
      await this.objectStorage.deleteObject(storagePath);

    } catch (error: unknown) {
      this.logger.error(`Transcription failed for session ${voiceSessionId}`, error instanceof Error ? error.stack : 'Unknown error');
      
      // Jitter for rate limits
      const baseDelay = job.opts.backoff && typeof job.opts.backoff === 'object' ? job.opts.backoff.delay ?? 2000 : 2000;
      const jitter = Math.floor(Math.random() * 1000) - 500;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      
      throw error; // Let Bull retry according to policy
    }
  }
}