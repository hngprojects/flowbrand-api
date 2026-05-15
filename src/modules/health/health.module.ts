import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../common/constants/queue.constants';
import { QueueModule } from '../../queue/queue.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.EMAIL }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
