import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JOB_RETENTION, QUEUES } from '../common/constants/queue.constants';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueueAsync({
      name: QUEUES.EMAIL,
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: config.get<number>('QUEUE_MAX_ATTEMPTS') ?? 3,
          backoff: {
            type: 'exponential',
            delay: config.get<number>('EMAIL_QUEUE_BACKOFF_DELAY') ?? 3000,
          },
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: {
            age: JOB_RETENTION.FAILED_MS / 1000,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class EmailQueueModule {}
