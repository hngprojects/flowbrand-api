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


  async getTasksByStageId(stageId: string): Promise<StageTask[]> {
    return this.repository.createQueryBuilder('t')
      .where('t.stage_id = :stageId', { stageId })
      .orderBy('t.position', 'ASC')
      .getMany();
  }

  async getStageCounts(stageIds: string[]): Promise<Record<string, unknown>[]> {
    if (!stageIds.length) return [];
    return this.repository
      .createQueryBuilder('t')
      .select('t.stage_id', 'stageId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)`, 'complete')
      .where('t.stage_id IN (:...ids)', { ids: stageIds })
      .groupBy('t.stage_id')
      .getRawMany();
  }

  async getSingleStageCount(stageId: string): Promise<Record<string, unknown> | undefined> {
    return this.repository
      .createQueryBuilder('t')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)`, 'complete')
      .where('t.stage_id = :stageId', { stageId })
      .getRawOne();
  }
}
