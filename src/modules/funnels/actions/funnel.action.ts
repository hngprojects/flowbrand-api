import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, type QueryDeepPartialEntity, Repository } from 'typeorm';
import { Funnel } from '../entities/funnel.entity';
import { FunnelStatus } from '../enums/funnel-status.enum';
import { FunnelStage } from '../entities/funnel-stage.entity';
import { StageTask } from '../entities/stage-task.entity';
import { StageStatus } from '../enums/stage-status.enum';

@Injectable()
export class FunnelModelAction extends AbstractModelAction<Funnel> {
  constructor(
    @InjectRepository(Funnel)
    private readonly funnelRepository: Repository<Funnel>,
  ) {
    super(funnelRepository, Funnel);
  }

  // Count tasks for a stage using the provided EntityManager (transaction aware).
  async countTasksForStage(manager: EntityManager, stageId: string): Promise<{ total: number; pending: number }> {
    const row = await manager
      .createQueryBuilder(StageTask, 'task')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN task.status = :pendingStatus THEN 1 ELSE 0 END)', 'pending')
      .where('task.stage_id = :stageId', { stageId, pendingStatus: 'pending' })
      .getRawOne<{ total?: string | number; pending?: string | number }>();

    return { total: Number(row?.total ?? 0), pending: Number(row?.pending ?? 0) };
  }

  // Update a stage's status only when it currently has the expected status (optimistic update).
  async updateStageStatusIfActive(
    manager: EntityManager,
    stageId: string,
    funnelId: string,
    newValues: QueryDeepPartialEntity<FunnelStage>,
  ): Promise<number> {
    const res = await manager.update(FunnelStage, { id: stageId, funnel_id: funnelId, status: StageStatus.ACTIVE }, newValues);
    return res.affected ?? 0;
  }

  async activateStageIfLocked(
    manager: EntityManager,
    stageId: string,
    funnelId: string,
    unlockedAt: Date,
  ): Promise<number> {
    const res = await manager.update(
      FunnelStage,
      { id: stageId, funnel_id: funnelId, status: StageStatus.LOCKED },
      { status: StageStatus.ACTIVE, unlocked_at: unlockedAt },
    );

    return res.affected ?? 0;
  }

  async findStageById(manager: EntityManager, stageId: string, funnelId: string): Promise<FunnelStage | null> {
    return manager.findOne(FunnelStage, { where: { id: stageId, funnel_id: funnelId } });
  }

  async findNextStage(manager: EntityManager, funnelId: string, position: number): Promise<FunnelStage | null> {
    return manager.findOne(FunnelStage, { where: { funnel_id: funnelId, position } });
  }

  // Idempotency lookup. Returns the existing funnel if (user_id,
  // idempotency_key) already exists, otherwise null. The global UNIQUE
  // constraint on idempotency_key plus the user_id filter together prevent
  // cross-user reuse.
  async findByIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<Funnel | null> {
    return this.funnelRepository.findOne({
      where: { user_id: userId, idempotency_key: idempotencyKey },
    });
  }

  // Concurrent-generation guard. Returns the in-flight funnel for this user
  // (if any) so the caller can return 409 GENERATION_IN_PROGRESS.
  async findGeneratingForUser(userId: string): Promise<Funnel | null> {
    return this.funnelRepository.findOne({
      where: { user_id: userId, status: FunnelStatus.GENERATING },
    });
  }

  // Status endpoint helper. Returns funnel only if the caller owns it, so
  // cross-user polling falls through to 404 (SEC-01: do not reveal existence).
  async findOwnedById(
    funnelId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<Funnel | null> {
    const repo = manager ? manager.getRepository(Funnel) : this.funnelRepository;

    return repo.findOne({
      where: { id: funnelId, user_id: userId },
    });
  }
}
