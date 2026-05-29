import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from './entities/activity-event.entity';
import { ActivityEventModelAction } from './actions/activity-event.action';
import { ActivityListener } from './listeners/activity.listener';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent])],
  providers: [ActivityEventModelAction, ActivityListener],
  exports: [ActivityEventModelAction],
})
export class ActivityModule {}
