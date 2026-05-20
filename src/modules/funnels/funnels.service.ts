import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funnel } from './entities/funnel.entity';
import { FunnelStage } from './entities/funnel-stage.entity';
import { StageStatus } from './enums/stage-status.enum';
import { StageTask } from './entities/stage-task.entity';
import * as SYS_MSG from '../../constants/system.messages';

type RawCountRow = Record<string, unknown>;

function mapStageCounts(raw: RawCountRow[] | undefined) {
  const map = new Map<string, { total: number; complete: number }>();
  if (!raw || !raw.length) return map;

  for (const row of raw) {
    const stageId = (row.stage_id ?? row.stageId) as string | undefined;
    const total = Number((row.total ?? row.total_count ?? 0));
    const complete = Number((row.complete ?? row.complete_count ?? 0));

    if (stageId) {
      map.set(stageId, {
        total: Number.isNaN(total) ? 0 : total,
        complete: Number.isNaN(complete) ? 0 : complete,
      });
    }
  }

  return map;
}

@Injectable()
export class FunnelsService {
  constructor(
    @InjectRepository(Funnel)
    private readonly funnelRepo: Repository<Funnel>,
    @InjectRepository(FunnelStage)
    private readonly stageRepo: Repository<FunnelStage>,
    @InjectRepository(StageTask)
    private readonly taskRepo: Repository<StageTask>,
  ) {}

  // Helper to normalize pagination params
  normalizePagination(page?: number, perPage?: number) {
    const p = page && page >= 1 ? page : 1;
    let per = !perPage || perPage <= 0 ? 20 : perPage;
    if (per > 20) per = 20;
    return { page: p, per_page: per };
  }

  async listForUser(userId: string, page?: number, perPage?: number) {
    const { page: p, per_page: per } = this.normalizePagination(page, perPage);
    const qb = this.funnelRepo.createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .orderBy('f.created_at', 'DESC')
      .skip((p - 1) * per)
      .take(per);

    // join stages but only select minimal fields
    qb.leftJoinAndSelect('f.stages', 's').addOrderBy('s.position', 'ASC');

    const [funnels, total] = await qb.getManyAndCount();

    const mapped = funnels.map((f) => ({
      funnelId: f.id,
      businessName: f.business_name,
      creationPath: f.creation_path,
      status: f.status,
      createdAt: f.created_at,
      stages: (f.stages ?? []).map((s) => ({ position: s.position, name: s.name, status: s.status })),
    }));

    return {
      funnels: mapped,
      pagination: { total, page: p, perPage: per, hasNext: p * per < total },
    };
  }

  async getFullFunnel(userId: string, funnelId: string) {
    const funnel = await this.funnelRepo.findOne({ where: { id: funnelId, user_id: userId } });
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    // load stages with tasks ordered
    const stages = await this.stageRepo.createQueryBuilder('s')
      .where('s.funnel_id = :funnelId', { funnelId })
      .orderBy('s.position', 'ASC')
      .leftJoinAndSelect('s.tasks', 't')
      .addOrderBy('t.position', 'ASC')
      .getMany();

    const stageIds = stages.map((s) => s.id);
    let countsMap = new Map<string, { total: number; complete: number }>();
    if (stageIds.length) {
      const rawCounts = (await this.taskRepo
        .createQueryBuilder('t')
        .select('t.stage_id', 'stage_id')
        .addSelect('COUNT(*)', 'total')
        .addSelect("SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)", 'complete')
        .where('t.stage_id IN (:...ids)', { ids: stageIds })
        .groupBy('t.stage_id')
        .getRawMany());

      countsMap = mapStageCounts(rawCounts);
    }

    const resultStages = stages.map((s) => ({
      stageId: s.id,
      position: s.position,
      name: s.name,
      channel: s.channel,
      status: s.status,
      unlockedAt: s.unlocked_at,
      completedAt: s.completed_at,
      explanation: s.explanation,
      actionPrompt: s.action_prompt,
      tasks: (s.tasks ?? []).map((t) => ({ id: t.id, position: t.position, name: t.name, status: t.status })),
      tasksTotal: countsMap.get(s.id)?.total ?? (s.tasks ?? []).length,
      tasksComplete: countsMap.get(s.id)?.complete ?? ((s.tasks ?? []).filter((t) => t.status === 'complete').length),
    }));

    return {
      funnelId: funnel.id,
      businessName: funnel.business_name,
      creationPath: funnel.creation_path,
      status: funnel.status,
      createdAt: funnel.created_at,
      stages: resultStages,
    };
  }

  async getStagesSummary(userId: string, funnelId: string) {
    const funnel = await this.funnelRepo.findOne({ where: { id: funnelId, user_id: userId } });
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const stages = await this.stageRepo.createQueryBuilder('s')
      .where('s.funnel_id = :funnelId', { funnelId })
      .orderBy('s.position', 'ASC')
      .getMany();

    const stageIds = stages.map((s) => s.id);
    let countsSummary = new Map<string, { total: number; complete: number }>();
    if (stageIds.length) {
      const rawCounts = (await this.taskRepo
        .createQueryBuilder('t')
        .select('t.stage_id', 'stage_id')
        .addSelect('COUNT(*)', 'total')
        .addSelect("SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)", 'complete')
        .where('t.stage_id IN (:...ids)', { ids: stageIds })
        .groupBy('t.stage_id')
        .getRawMany());

      countsSummary = mapStageCounts(rawCounts);
    }

    return stages.map((s) => ({
      stageId: s.id,
      position: s.position,
      name: s.name,
      channel: s.channel,
      status: s.status,
      unlockedAt: s.unlocked_at,
      completedAt: s.completed_at,
      tasksTotal: countsSummary.get(s.id)?.total ?? 0,
      tasksComplete: countsSummary.get(s.id)?.complete ?? 0,
    }));
  }

  async getStageDetail(userId: string, funnelId: string, stageId: string) {
    const funnel = await this.funnelRepo.findOne({ where: { id: funnelId, user_id: userId } });
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const stage = await this.stageRepo.findOne({ where: { id: stageId, funnel_id: funnelId } });
    if (!stage) throw new NotFoundException(SYS_MSG.FUNNEL_STAGE_NOT_FOUND);

    if (stage.status === StageStatus.LOCKED) {
      // find prior stage
      const prior = await this.stageRepo.findOne({ where: { funnel_id: funnelId, position: stage.position - 1 } });
      const priorName = prior ? prior.name : 'previous';
      throw new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE(stage.name, priorName));
    }

    // load tasks ordered
    const tasks = await this.taskRepo.createQueryBuilder('t')
      .where('t.stage_id = :stageId', { stageId })
      .orderBy('t.position', 'ASC')
      .getMany();

     
    const raw = (await this.taskRepo
      .createQueryBuilder('t')
      .select('COUNT(*)', 'total')
      .addSelect("SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END)", 'complete')
      .where('t.stage_id = :stageId', { stageId })
      .getRawOne()) as unknown as { total?: string | number; complete?: string | number } | undefined;

    const totalCount = Number(raw?.total ?? 0);
    const completeCount = Number(raw?.complete ?? 0);

    return {
      stageId: stage.id,
      position: stage.position,
      name: stage.name,
      channel: stage.channel,
      status: stage.status,
      unlockedAt: stage.unlocked_at,
      completedAt: stage.completed_at,
      explanation: stage.explanation,
      actionPrompt: stage.action_prompt,
      tasks: tasks.map((t) => ({ id: t.id, position: t.position, name: t.name, status: t.status })),
      tasksTotal: totalCount,
      tasksComplete: completeCount,
    };
  }
}
