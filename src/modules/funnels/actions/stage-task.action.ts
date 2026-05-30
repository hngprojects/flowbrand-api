import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageTask } from '../entities/stage-task.entity';
import { FunnelStage } from '../entities/funnel-stage.entity';
import { Funnel } from '../entities/funnel.entity';

export interface FunnelTaskProgress {
  total: number;
  complete: number;
}

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

  /** Total and completed task counts across every stage of a funnel (for milestone progress). */
  async getFunnelTaskProgress(funnelId: string): Promise<FunnelTaskProgress> {
    const raw = await this.repository
      .createQueryBuilder('t')
      .innerJoin(FunnelStage, 's', 's.id = t.stage_id')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)`, 'complete')
      .where('s.funnel_id = :funnelId', { funnelId })
      .getRawOne<{ total: string; complete: string | null }>();

    return {
      total: Number(raw?.total ?? 0),
      complete: Number(raw?.complete ?? 0),
    };
  }

  /** Total and completed task counts across every funnel owned by a user (for the weekly digest). */
  async getUserTaskProgress(userId: string): Promise<FunnelTaskProgress> {
    const raw = await this.repository
      .createQueryBuilder('t')
      .innerJoin(FunnelStage, 's', 's.id = t.stage_id')
      .innerJoin(Funnel, 'f', 'f.id = s.funnel_id')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)`, 'complete')
      .where('f.user_id = :userId', { userId })
      .getRawOne<{ total: string; complete: string | null }>();

    return {
      total: Number(raw?.total ?? 0),
      complete: Number(raw?.complete ?? 0),
    };
  }

  async getSingleStageCount(stageId: string): Promise<Record<string, unknown> | undefined> {
    return this.repository
      .createQueryBuilder('t')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)`, 'complete')
      .where('t.stage_id = :stageId', { stageId })
      .getRawOne();
  }

  async findOwnedTask(taskId: string, stageId: string): Promise<StageTask | null> {
    return this.repository.findOne({ where: { id: taskId, stage_id: stageId } });
  }

  async saveTask(task: StageTask): Promise<StageTask> {
    return this.repository.save(task);
  }
}
