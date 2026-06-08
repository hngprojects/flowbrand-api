import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { VoiceOnboardingController } from './controllers/voice-onboarding.controller';
import { VoiceOnboardingService } from './services/voice-onboarding.service';
import { VoiceTranscriptionService } from './services/voice-transcription.service';
import { VoiceTranscriptionProcessor } from './processors/voice-transcription.processor';
import { UploadModule } from '../../upload/upload.module';
import { RedisModule } from '../../redis/redis.module';
import { QUEUES } from '../../../common/constants/queue.constants';

@Module({
  imports: [
    UploadModule,
    RedisModule,
    BullModule.registerQueue({
      name: QUEUES.VOICE_TRANSCRIPTION,
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