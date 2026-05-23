import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JOB_RETENTION, QUEUES } from '../common/constants/queue.constants';
import { FunnelModelAction } from '../modules/funnels/actions/funnel.action';
import { Funnel } from '../modules/funnels/entities/funnel.entity';
import { FunnelStage } from '../modules/funnels/entities/funnel-stage.entity';
import { StageTask } from '../modules/funnels/entities/stage-task.entity';
import { FunnelTemplateService } from '../modules/funnels/services/funnel-template.service';
import { FunnelGenerationProcessor } from './processors/funnel-generation.processor';
import { QueueModule } from './queue.module';
import { LlmModule } from '../modules/llm/llm.module';

@Module({
  imports: [
    QueueModule,
    LlmModule,
    BullModule.registerQueueAsync({
      name: QUEUES.FUNNEL_GENERATION,
      useFactory: (config: ConfigService) => ({
        settings: {
          // LLM calls can take up to 60 s — extend lock so Bull doesn't
          // mark the job stalled before the app-level timeout fires.
          lockDuration: 120_000,
        },
        defaultJobOptions: {
          attempts: config.get<number>('QUEUE_MAX_ATTEMPTS') ?? 3,
          backoff: {
            type: 'exponential',
            delay: config.get<number>('QUEUE_BACKOFF_DELAY') ?? 5000,
          },
          removeOnComplete: { age: JOB_RETENTION.COMPLETED_MS / 1000, count: 500 },
          removeOnFail: { age: JOB_RETENTION.FAILED_MS / 1000 },
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Funnel, FunnelStage, StageTask]),
  ],
  providers: [FunnelGenerationProcessor, FunnelTemplateService, FunnelModelAction],
  exports: [BullModule],
})
export class FunnelGenerationQueueModule {}
