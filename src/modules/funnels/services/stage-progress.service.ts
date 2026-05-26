import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';
import { FunnelModelAction } from '../actions/funnel.action';
import { FunnelStageModelAction } from '../actions/funnel-stage.action';
import { StageTaskModelAction } from '../actions/stage-task.action';
import { StageStatus } from '../enums/stage-status.enum';
import type { StageTaskStatus } from '../entities/stage-task.entity';

export interface TaskUpdateResult {
  taskId: string;
  stageId: string;
  status: StageTaskStatus;
  completedAt: Date | null;
}

export interface UnlockedStageSummary {
  stageId: string;
  position: number;
  name: string;
  status: StageStatus;
  unlockedAt: Date | null;
}

export interface StageCompletionResult {
  stageId: string;
  status: StageStatus;
  completedAt: Date | null;
  nextStage: UnlockedStageSummary | null;
}

@Injectable()
export class StageProgressService {
  constructor(
    private readonly funnelAction: FunnelModelAction,
    private readonly stageAction: FunnelStageModelAction,
    private readonly taskAction: StageTaskModelAction,
  ) {}

  /** PATCH a single task's status. Only allowed while the stage is active. */
  async completeTask(
    userId: string,
    funnelId: string,
    stageId: string,
    taskId: string,
    status: StageTaskStatus,
  ): Promise<TaskUpdateResult> {
    const stage = await this.getOwnedStage(userId, funnelId, stageId);

    if (stage.status !== StageStatus.ACTIVE) {
      throw new UnprocessableEntityException(SYS_MSG.STAGE_NOT_ACTIVE_FOR_UPDATE);
    }

    const task = await this.taskAction.findOwnedTask(taskId, stageId);
    if (!task) {
      throw new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND);
    }

    task.status = status;
    const saved = await this.taskAction.saveTask(task);

    return {
      taskId: saved.id,
      stageId: saved.stage_id,
      status: saved.status,
      completedAt: saved.completed_at,
    };
  }

  /**
   * Mark a stage complete and unlock the next one. Requires the stage to be
   * active with every task complete.
   */
  async completeStage(
    userId: string,
    funnelId: string,
    stageId: string,
  ): Promise<StageCompletionResult> {
    const stage = await this.getOwnedStage(userId, funnelId, stageId);

    if (stage.status === StageStatus.COMPLETE) {
      throw new ConflictException(SYS_MSG.STAGE_ALREADY_COMPLETE);
    }
    if (stage.status !== StageStatus.ACTIVE) {
      throw new UnprocessableEntityException(SYS_MSG.STAGE_NOT_ACTIVE_FOR_COMPLETION);
    }

    const { total, complete } = await this.taskAction.countByStage(stageId);
    if (total === 0 || complete < total) {
      throw new UnprocessableEntityException(SYS_MSG.STAGE_TASKS_INCOMPLETE);
    }

    const { completedStage, unlockedStage } = await this.stageAction.completeAndUnlockNext(stage);

    return {
      stageId: completedStage.id,
      status: completedStage.status,
      completedAt: completedStage.completed_at,
      nextStage: unlockedStage
        ? {
            stageId: unlockedStage.id,
            position: unlockedStage.position,
            name: unlockedStage.name,
            status: unlockedStage.status,
            unlockedAt: unlockedStage.unlocked_at,
          }
        : null,
    };
  }

  /** Verify funnel ownership and stage membership, returning the stage. */
  private async getOwnedStage(userId: string, funnelId: string, stageId: string) {
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) {
      throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);
    }

    const stage = await this.stageAction.findOwnedStage(stageId, funnelId);
    if (!stage) {
      throw new NotFoundException(SYS_MSG.FUNNEL_STAGE_NOT_FOUND);
    }

    return stage;
  }
}
