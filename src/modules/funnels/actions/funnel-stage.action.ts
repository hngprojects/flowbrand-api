import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelStage } from '../entities/funnel-stage.entity';
import { StageStatus } from '../enums/stage-status.enum';

/** Raw projection for the admin risk scan: an active stage and its owner. */
export interface StuckStageRow {
  stage_id: string;
  stage_name: string;
  funnel_id: string;
  user_id: string;
  user_full_name: string | null;
  user_avatar_url: string | null;
  days_stuck: number;
}

@Injectable()
export class FunnelStageModelAction extends AbstractModelAction<FunnelStage> {
  constructor(
    @InjectRepository(FunnelStage)
    repository: Repository<FunnelStage>,
  ) {
    super(repository, FunnelStage);
  }

  async getStagesByFunnelId(funnelId: string): Promise<FunnelStage[]> {
    return this.repository.createQueryBuilder('s')
      .where('s.funnel_id = :funnelId', { funnelId })
      .orderBy('s.position', 'ASC')
      .getMany();
  }

  async getStagesWithTasks(funnelId: string): Promise<FunnelStage[]> {
    return this.repository.createQueryBuilder('s')
      .where('s.funnel_id = :funnelId', { funnelId })
      .orderBy('s.position', 'ASC')
      .leftJoinAndSelect('s.tasks', 't')
      .addOrderBy('t.position', 'ASC')
      .getMany();
  }

  /** Active stages unlocked before `threshold`, with their owner (deleted accounts excluded). */
  async findStuckStages(threshold: Date): Promise<StuckStageRow[]> {
    const rows = await this.repository
      .createQueryBuilder('stage')
      .innerJoin('stage.funnel', 'funnel')
      .innerJoin('funnel.user', 'user', 'user.deleted_at IS NULL')
      .select('stage.id', 'stage_id')
      .addSelect('stage.name', 'stage_name')
      .addSelect('funnel.id', 'funnel_id')
      .addSelect('user.id', 'user_id')
      .addSelect('user.full_name', 'user_full_name')
      .addSelect('user.avatar_url', 'user_avatar_url')
      .addSelect('FLOOR(EXTRACT(EPOCH FROM (NOW() - stage.unlocked_at)) / 86400)', 'days_stuck')
      .where('stage.status = :status', { status: StageStatus.ACTIVE })
      .andWhere('stage.unlocked_at IS NOT NULL')
      .andWhere('stage.unlocked_at < :threshold', { threshold })
      .getRawMany<Omit<StuckStageRow, 'days_stuck'> & { days_stuck: string }>();

    // days_stuck arrives as a string because pg returns numerics as text.
    return rows.map((row) => ({ ...row, days_stuck: Number(row.days_stuck) }));
  }
}