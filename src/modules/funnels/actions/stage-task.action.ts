import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageTask, TASK_STATUS_COMPLETE } from '../entities/stage-task.entity';

export interface StageTaskCounts {
  total: number;
  complete: number;
}

@Injectable()
export class StageTaskModelAction extends AbstractModelAction<StageTask> {
  constructor(
    @InjectRepository(StageTask)
    private readonly stageTaskRepository: Repository<StageTask>,
  ) {
    super(stageTaskRepository, StageTask);
  }

  /** Owner-scoped task lookup: a task is only addressable through its stage. */
  async findOwnedTask(taskId: string, stageId: string): Promise<StageTask | null> {
    return this.stageTaskRepository.findOne({ where: { id: taskId, stage_id: stageId } });
  }

  /**
   * Persist a task entity directly (not the base `update`) so the entity's
   * `@BeforeUpdate` hook runs and keeps `is_complete`/`completed_at` in
   * sync with `status`.
   */
  async saveTask(task: StageTask): Promise<StageTask> {
    return this.stageTaskRepository.save(task);
  }

  /**
   * Total tasks and how many are complete for a stage (for the unlock guard).
   * Uses typed `count()` calls so the "complete" status is checked against the
   * `StageTaskStatus` union rather than a hardcoded SQL string.
   */
  async countByStage(stageId: string): Promise<StageTaskCounts> {
    const [total, complete] = await Promise.all([
      this.stageTaskRepository.count({ where: { stage_id: stageId } }),
      this.stageTaskRepository.count({ where: { stage_id: stageId, status: TASK_STATUS_COMPLETE } }),
    ]);

    return { total, complete };
  }
}
