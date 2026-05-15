import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { JOB_RETENTION, QUEUES } from '../common/constants/queue.constants';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({
      name: QUEUES.EMAIL,
      defaultJobOptions: {
        attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS ?? '3'),
        backoff: {
          type: 'exponential',
          delay: parseInt(process.env.EMAIL_QUEUE_BACKOFF_DELAY ?? '3000'),
        },
        removeOnComplete: true,
        removeOnFail: {
          age: JOB_RETENTION.FAILED_MS / 1000,
        },
      },
    }),
  ],
  exports: [BullModule],
})
export class EmailQueueModule {}
