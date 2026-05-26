import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelStage } from '../entities/funnel-stage.entity';
import { StageStatus } from '../enums/stage-status.enum';

export interface CompleteAndUnlockResult {
  completedStage: FunnelStage;
  unlockedStage: FunnelStage | null;
}

@Injectable()
export class FunnelStageModelAction extends AbstractModelAction<FunnelStage> {
  constructor(
    @InjectRepository(FunnelStage)
    private readonly funnelStageRepository: Repository<FunnelStage>,
  ) {
    super(funnelStageRepository, FunnelStage);
  }

  /** Owner-scoped stage lookup: a stage is only addressable through its funnel. */
  async findOwnedStage(stageId: string, funnelId: string): Promise<FunnelStage | null> {
    return this.funnelStageRepository.findOne({ where: { id: stageId, funnel_id: funnelId } });
  }

  /**
   * Atomically mark a stage complete and unlock the next stage (by position).
   * The two writes share one transaction so a funnel can never end up with a
   * completed stage whose successor stayed locked.
   */
  async completeAndUnlockNext(stage: FunnelStage): Promise<CompleteAndUnlockResult> {
    return this.funnelStageRepository.manager.transaction(async (manager) => {
      const now = new Date();

      stage.status = StageStatus.COMPLETE;
      stage.completed_at = now;
      const completedStage = await manager.save(FunnelStage, stage);

      const next = await manager.findOne(FunnelStage, {
        where: { funnel_id: stage.funnel_id, position: stage.position + 1 },
      });

      let unlockedStage: FunnelStage | null = null;
      if (next && next.status === StageStatus.LOCKED) {
        next.status = StageStatus.ACTIVE;
        next.unlocked_at = now;
        unlockedStage = await manager.save(FunnelStage, next);
      }

      return { completedStage, unlockedStage };
    });
  }
}
