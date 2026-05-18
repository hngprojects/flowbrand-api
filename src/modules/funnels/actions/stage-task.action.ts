import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageTask } from '../entities/stage-task.entity';

@Injectable()
export class StageTaskModelAction extends AbstractModelAction<StageTask> {
  constructor(
    @InjectRepository(StageTask)
    private readonly stageTaskRepository: Repository<StageTask>,
  ) {
    super(stageTaskRepository, StageTask);
  }
}
