import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { VoiceOnboardingController } from './voice-onboarding.controller';
import { VoiceOnboardingService } from './services/voice-onboarding.service';
import { VoiceTranscriptionService } from './services/voice-transcription.service';
import { VoiceTranscriptionProcessor } from './processors/voice-transcription.processor';
import { UploadModule } from '../../upload/upload.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    UploadModule, // Provides UploadedDocumentModelAction and Minio Storage
    RedisModule,
    BullModule.registerQueue({
      name: 'voice-transcription',
    }),
  ],
  controllers: [VoiceOnboardingController],
  providers: [
    VoiceOnboardingService,
    VoiceTranscriptionService,
    VoiceTranscriptionProcessor,
  ],
  exports: [VoiceOnboardingService],
})
export class VoiceOnboardingModule {}