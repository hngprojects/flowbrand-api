import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEvent } from '../entities/activity-event.entity';

@Injectable()
export class ActivityEventModelAction extends AbstractModelAction<ActivityEvent> {
  constructor(
    @InjectRepository(ActivityEvent)
    repository: Repository<ActivityEvent>,
  ) {
    super(repository, ActivityEvent);
  }
}
