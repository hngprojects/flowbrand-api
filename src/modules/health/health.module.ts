import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { QUEUES } from '../../common/constants/queue.constants';
import { QueueModule } from '../../queue/queue.module';
import { HealthController } from './health.controller';
import { HEALTH_RATE_LIMIT } from './health.constants';

@Module({
  imports: [
    ThrottlerModule.forRoot([HEALTH_RATE_LIMIT]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.FUNNEL_GENERATION }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
