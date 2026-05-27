import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageTask } from '../entities/stage-task.entity';

@Injectable()
export class StageTaskModelAction extends AbstractModelAction<StageTask> {
  constructor(
    @InjectRepository(StageTask)
    repository: Repository<StageTask>,
  ) {
    super(repository, StageTask);
  }
  async findTasksByStageId(stageId: string): Promise<StageTask[]> {
  return this.repository
    .createQueryBuilder('st')
    .where('st.stage_id = :stageId', { stageId })
    .getMany();
}
}
