import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, QueryDeepPartialEntity, In } from 'typeorm';
import { Funnel } from '../entities/funnel.entity';
import { FunnelStatus } from '../enums/funnel-status.enum';
import { FunnelStage } from '../entities/funnel-stage.entity';
import { StageTask } from '../entities/stage-task.entity';
import { StageStatus } from '../enums/stage-status.enum';
import { WizardSession } from '../../onboarding/entities/wizzard-session.entity';
import { WizardStatus } from '../../onboarding/enums/wizzard-status.enum';
import { UploadedDocument } from '../../upload/entities/uploaded-document.entity';

@Injectable()
export class FunnelModelAction extends AbstractModelAction<Funnel> {
  constructor(
    @InjectRepository(Funnel)
    private readonly funnelRepository: Repository<Funnel>,
    private readonly manager: EntityManager,
  ) {
    super(funnelRepository, Funnel);
  }

  async countTasksForStage(manager: EntityManager, stageId: string): Promise<{ total: number; pending: number }> {
    const row = await manager
      .createQueryBuilder(StageTask, 'task')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN task.status = :pendingStatus THEN 1 ELSE 0 END)', 'pending')
      .where('task.stage_id = :stageId', { stageId, pendingStatus: 'pending' })
      .getRawOne<{ total?: string | number; pending?: string | number }>();

    return { total: Number(row?.total ?? 0), pending: Number(row?.pending ?? 0) };
  }

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

  async findByIdempotency(userId: string, idempotencyKey: string): Promise<Funnel | null> {
    return this.funnelRepository.findOne({
      where: { user_id: userId, idempotency_key: idempotencyKey },
    });
  }

  async findOwnedById(funnelId: string, userId: string, manager?: EntityManager): Promise<Funnel | null> {
    const repo = manager ? manager.getRepository(Funnel) : this.funnelRepository;
    return repo.findOne({ where: { id: funnelId, user_id: userId } });
  }

  async listForUserPaginated(userId: string, page: number, perPage: number): Promise<[Funnel[], number]> {
    return this.funnelRepository.createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .orderBy('f.created_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .leftJoinAndSelect('f.stages', 's')
      .addOrderBy('s.position', 'ASC')
      .getManyAndCount();
  }

  async getLatestCompletedWizard(userId: string): Promise<WizardSession | null> {
    return this.manager.getRepository(WizardSession).findOne({
      where: { user_id: userId, status: WizardStatus.COMPLETE },
      order: { updated_at: 'DESC' },
    });
  }

  async findFunnelsByUserId(userId: string): Promise<Funnel[]> {
    return this.repository
      .createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .orderBy('f.created_at', 'DESC')
      .getMany();
  }

  async findFunnelByIdAndUser(funnelId: string, userId: string): Promise<Funnel | null> {
    return this.repository
      .createQueryBuilder('f')
      .where('f.id = :funnelId', { funnelId })
      .andWhere('f.user_id = :userId', { userId })
      .getOne();
  }

  async getUploadedDocuments(userId: string, ids: string[]): Promise<UploadedDocument[]> {
    return this.manager.getRepository(UploadedDocument).find({
      where: { id: In(ids), user_id: userId },
    });
  }
}
