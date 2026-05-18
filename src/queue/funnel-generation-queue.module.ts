import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JOB_RETENTION, QUEUES } from '../common/constants/queue.constants';
import { FunnelModelAction } from '../modules/funnels/actions/funnel.action';
import { FunnelStageModelAction } from '../modules/funnels/actions/funnel-stage.action';
import { StageTaskModelAction } from '../modules/funnels/actions/stage-task.action';
import { Funnel } from '../modules/funnels/entities/funnel.entity';
import { FunnelStage } from '../modules/funnels/entities/funnel-stage.entity';
import { StageTask } from '../modules/funnels/entities/stage-task.entity';
import { FunnelTemplateService } from '../modules/funnels/services/funnel-template.service';
import { LlmService, NullLlmService } from './interfaces/llm.service.interface';
import { FunnelGenerationProcessor } from './processors/funnel-generation.processor';
import { QueueModule } from './queue.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueueAsync({
      name: QUEUES.FUNNEL_GENERATION,
      useFactory: (config: ConfigService) => ({
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
  providers: [
    FunnelGenerationProcessor,
    FunnelTemplateService,
    FunnelModelAction,
    FunnelStageModelAction,
    StageTaskModelAction,
    // Swapped for the real implementation when BE-304 lands
    { provide: LlmService, useClass: NullLlmService },
  ],
  exports: [BullModule],
})
export class FunnelGenerationQueueModule {}
