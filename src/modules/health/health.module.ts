import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { QUEUES } from '../../common/constants/queue.constants';
import { QueueModule } from '../../queue/queue.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.FUNNEL_GENERATION }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
