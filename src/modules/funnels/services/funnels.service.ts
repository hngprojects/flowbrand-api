import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APP_EVENTS } from '../../../common/constants/app-events';
import {
  StageCompletedEvent,
  StageUnlockedEvent,
  FeedbackSubmittedEvent,
  TaskCompletedEvent,
  TaskReopenedEvent,
} from '../../../common/events';
import { emitSafely } from '../../../common/events/emit-safely';
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import * as SYS_MSG from '../../../constants/system.messages';
import { RedisService } from '../../redis/redis.service';
import { FunnelModelAction } from './../actions/funnel.action';
import { FunnelStageModelAction } from './../actions/funnel-stage.action';
import { StageTaskModelAction } from './../actions/stage-task.action';
import { CreateFunnelDto } from './../dto/create-funnel.dto';
import { Funnel } from './../entities/funnel.entity';
import { FunnelStage } from './../entities/funnel-stage.entity';
import { FunnelStatus } from './../enums/funnel-status.enum';
import { StageStatus } from './../enums/stage-status.enum';
import { FunnelCreationPath } from './../enums/funnel-creation-path.enum';
import { UploadDocumentStatus } from '../../upload/upload.types';
import type { BusinessContext, GenerateFunnelJobPayload } from './../interfaces/generate-funnel-job.interface';
import type {
  FunnelGenerationCreateResult,
  FunnelStatusResult,
  StageCompletionResult,
  SubmitFeedbackResponse,
  TaskUpdateResult,
} from './../interfaces/funnels.interfaces';
import { StageTask, StageTaskStatus } from './../entities/stage-task.entity';
import { UploadedDocument } from '../../upload/entities/uploaded-document.entity';
import { StageFeedbackModelAction } from '../actions/stage-feedback.action';
import { SubmitStageFeedbackDto } from '../dto/submit-stage-feedback.dto';
import { StageFeedback } from '../entities/stage-feedback.entity';

const STAGE_NAMES = ['Get Noticed', 'Spark Interest', 'Make First Sale', 'Bring Them Back'] as const;
const QUEUE_DELAY_MS = 250;
const DEFAULT_BUSINESS_NAME = 'My Business';

@Injectable()
export class FunnelsService {
  private readonly logger = new Logger(FunnelsService.name);

  constructor(
    private readonly funnelAction: FunnelModelAction,
    private readonly stageAction: FunnelStageModelAction,
    private readonly taskAction: StageTaskModelAction,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUES.FUNNEL_GENERATION) private readonly queue: Queue<GenerateFunnelJobPayload>,
    private readonly dataSource: DataSource,
    private readonly feedbackAction: StageFeedbackModelAction,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  normalizePagination(page?: number, perPage?: number) {
    const p = page && page >= 1 ? page : 1;
    let per = !perPage || perPage <= 0 ? 20 : perPage;
    if (per > 20) per = 20;
    return { page: p, per_page: per };
  }

  private mapStageCounts(raw: Record<string, unknown>[] | undefined) {
    const map = new Map<string, { total: number; complete: number }>();
    if (!raw || !raw.length) return map;

    for (const row of raw) {
      const stageId = (row.stageId ?? row.stage_id) as string | undefined;
      const total = Number(row.total ?? 0);
      const complete = Number(row.complete ?? 0);

      if (stageId) {
        map.set(stageId, {
          total: Number.isNaN(total) ? 0 : total,
          complete: Number.isNaN(complete) ? 0 : complete,
        });
      }
    }
    return map;
  }

  async listForUser(userId: string, page?: number, perPage?: number) {
    const { page: p, per_page: per } = this.normalizePagination(page, perPage);
    const [funnels, total] = await this.funnelAction.listForUserPaginated(userId, p, per);

    const allStageIds = funnels.flatMap((f) => (f.stages ?? []).map((s) => s.id));
    let countsMap = new Map<string, { total: number; complete: number }>();

    if (allStageIds.length) {
      const rawCounts = await this.taskAction.getStageCounts(allStageIds);
      countsMap = this.mapStageCounts(rawCounts);
    }

    const mapped = funnels.map((f) => ({
      funnelId: f.id,
      businessName: f.business_name,
      creationPath: f.creation_path,
      status: f.status,
      createdAt: f.created_at,
      stages: (f.stages ?? []).map((s) => ({
        position: s.position,
        name: s.name,
        status: s.status,
        tasksTotal: countsMap.get(s.id)?.total ?? 0,
        tasksComplete: countsMap.get(s.id)?.complete ?? 0,
      })),
    }));

    return {
      funnels: mapped,
      pagination: { total, page: p, perPage: per, hasNext: p * per < total },
    };
  }

  async getFullFunnel(userId: string, funnelId: string) {
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const stages = await this.stageAction.getStagesWithTasks(funnelId);
    const stageIds = stages.map((s) => s.id);
    let countsMap = new Map<string, { total: number; complete: number }>();

    if (stageIds.length) {
      const rawCounts = await this.taskAction.getStageCounts(stageIds);
      countsMap = this.mapStageCounts(rawCounts);
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
      tasksComplete: countsMap.get(s.id)?.complete ?? (s.tasks ?? []).filter((t) => t.status === 'complete').length,
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
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const stages = await this.stageAction.getStagesByFunnelId(funnelId);
    const stageIds = stages.map((s) => s.id);
    let countsSummary = new Map<string, { total: number; complete: number }>();

    if (stageIds.length) {
      const rawCounts = await this.taskAction.getStageCounts(stageIds);
      countsSummary = this.mapStageCounts(rawCounts);
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
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const stage = await this.stageAction.get({ identifierOptions: { id: stageId, funnel_id: funnelId } });
    if (!stage) throw new NotFoundException(SYS_MSG.FUNNEL_STAGE_NOT_FOUND);

    if (stage.status === StageStatus.LOCKED) {
      const prior = await this.stageAction.get({
        identifierOptions: { funnel_id: funnelId, position: stage.position - 1 },
      });
      const priorName = prior ? prior.name : 'previous';
      throw new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE(stage.name, priorName));
    }

    const tasks = await this.taskAction.getTasksByStageId(stageId);
    const rawCount = await this.taskAction.getSingleStageCount(stageId);

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
      tasksTotal: Number(rawCount?.total ?? 0),
      tasksComplete: Number(rawCount?.complete ?? 0),
    };
  }

  async createGeneration(userId: string, dto: CreateFunnelDto): Promise<FunnelGenerationCreateResult> {
    const existing = await this.funnelAction.findByIdempotency(userId, dto.idempotency_key);
    if (existing) {
      return {
        statusCode: HttpStatus.OK,
        message: SYS_MSG.FUNNEL_ALREADY_EXISTS,
        funnelId: existing.id,
        status: existing.status,
      };
    }

    await this.checkRateLimit(userId);
    const { businessName, businessContext } = await this.validateSourceAndDeriveContext(userId, dto);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const funnel = await queryRunner.manager.save(Funnel, {
        user_id: userId,
        business_name: businessName,
        creation_path: dto.source,
        status: FunnelStatus.GENERATING,
        idempotency_key: dto.idempotency_key,
        business_context: businessContext,
      });

      const stages = STAGE_NAMES.map((name, idx) =>
        queryRunner.manager.create(FunnelStage, {
          funnel_id: funnel.id,
          position: idx + 1,
          name,
          status: idx === 0 ? StageStatus.ACTIVE : StageStatus.LOCKED,
          unlocked_at: idx === 0 ? new Date() : null,
        }),
      );
      await queryRunner.manager.save(FunnelStage, stages);

      try {
        await this.queue.add(
          JOBS.GENERATE_FUNNEL,
          { funnelId: funnel.id, userId },
          { jobId: `funnel:${funnel.id}`, delay: QUEUE_DELAY_MS },
        );
      } catch (queueErr) {
        this.logger.error({
          message: 'Bull queue dispatch failed; rolling back funnel insert',
          error: (queueErr as Error).message,
          funnelId: funnel.id,
        });
        throw new ServiceUnavailableException(SYS_MSG.GENERATION_SERVICE_UNAVAILABLE);
      }

      await queryRunner.commitTransaction();

      return {
        statusCode: HttpStatus.ACCEPTED,
        message: SYS_MSG.FUNNEL_GENERATION_STARTED,
        funnelId: funnel.id,
        status: FunnelStatus.GENERATING,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getStatus(funnelId: string, userId: string): Promise<FunnelStatusResult> {
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const base = { funnelId: funnel.id, status: funnel.status };

    if (funnel.status === FunnelStatus.ACTIVE) return { ...base, redirect: { to: 'strategy_dashboard' } };
    if (funnel.status === FunnelStatus.FAILED) {
      return {
        ...base,
        error: {
          code: 'GENERATION_FAILED',
          message: SYS_MSG.GENERATION_FAILED,
          retry_endpoint: '/api/funnels/generate',
        },
      };
    }
    return base;
  }

  async completeStage(
    funnelId: string,
    stageId: string,
    userId: string,
  ): Promise<{ statusCode: HttpStatus; message: string; data: StageCompletionResult }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();
      const funnel = await this.funnelAction.findOwnedById(funnelId, userId, queryRunner.manager);
      if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

      if (funnel.status !== FunnelStatus.ACTIVE) {
        throw new UnprocessableEntityException(SYS_MSG.STAGE_COMPLETION_REQUIRES_ACTIVE_FUNNEL);
      }

      const currentStage = await this.funnelAction.findStageById(queryRunner.manager, stageId, funnelId);
      if (!currentStage) throw new NotFoundException(SYS_MSG.FUNNEL_OR_STAGE_NOT_FOUND);

      if (currentStage.status === StageStatus.COMPLETE) {
        const unlockedStage = await this.funnelAction.findNextStage(
          queryRunner.manager,
          funnelId,
          currentStage.position + 1,
        );
        await queryRunner.rollbackTransaction();
        return {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.STAGE_ALREADY_COMPLETE,
          data: this.buildStageCompletionResult(currentStage, unlockedStage),
        };
      }

      if (currentStage.status === StageStatus.LOCKED) {
        const priorStage = await this.funnelAction.findNextStage(
          queryRunner.manager,
          funnelId,
          currentStage.position - 1,
        );
        const priorName = priorStage?.name ?? 'previous';
        throw new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE(currentStage.name, priorName));
      }

      const taskCounts = await this.funnelAction.countTasksForStage(queryRunner.manager, stageId);
      if (taskCounts.total === 0) throw new UnprocessableEntityException(SYS_MSG.STAGE_HAS_NO_TASKS);
      if (taskCounts.pending > 0)
        throw new UnprocessableEntityException(SYS_MSG.STAGE_HAS_PENDING_TASKS(taskCounts.pending));

      const completedAt = new Date();
      const affected = await this.funnelAction.updateStageStatusIfActive(queryRunner.manager, stageId, funnelId, {
        status: StageStatus.COMPLETE,
        completed_at: completedAt,
      });

      if (affected === 0) {
        const latestStage = await this.funnelAction.findStageById(queryRunner.manager, stageId, funnelId);
        const unlockedStage = await this.funnelAction.findNextStage(
          queryRunner.manager,
          funnelId,
          currentStage.position + 1,
        );
        await queryRunner.rollbackTransaction();
        if (latestStage?.status === StageStatus.COMPLETE) {
          return {
            statusCode: HttpStatus.OK,
            message: SYS_MSG.STAGE_ALREADY_COMPLETE,
            data: this.buildStageCompletionResult(latestStage, unlockedStage),
          };
        }
        throw new ConflictException(SYS_MSG.STAGE_COMPLETION_CONCURRENT_UPDATE);
      }

      const nextStage = await this.funnelAction.findNextStage(queryRunner.manager, funnelId, currentStage.position + 1);
      if (nextStage) {
        await this.funnelAction.activateStageIfLocked(queryRunner.manager, nextStage.id, funnelId, completedAt);
      }

      await queryRunner.commitTransaction();

      emitSafely(
        this.eventEmitter,
        this.logger,
        APP_EVENTS.STAGE_COMPLETED,
        new StageCompletedEvent(
          userId,
          funnelId,
          stageId,
          currentStage.position,
          currentStage.name,
          nextStage?.id ?? null,
          nextStage?.name ?? null,
        ),
      );

      if (nextStage) {
        emitSafely(
          this.eventEmitter,
          this.logger,
          APP_EVENTS.STAGE_UNLOCKED,
          new StageUnlockedEvent(userId, funnelId, nextStage.id, nextStage.position, nextStage.name),
        );
      }

      const unlockedStage = nextStage
        ? await this.funnelAction.findStageById(queryRunner.manager, nextStage.id, funnelId)
        : null;
      return {
        statusCode: HttpStatus.OK,
        message: SYS_MSG.STAGE_COMPLETED_SUCCESSFULLY,
        data: this.buildStageCompletionResult(
          { ...currentStage, status: StageStatus.COMPLETE, completed_at: completedAt },
          unlockedStage,
        ),
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async validateSourceAndDeriveContext(
    userId: string,
    dto: CreateFunnelDto,
  ): Promise<{ businessName: string; businessContext: BusinessContext }> {
    if (dto.source === FunnelCreationPath.WIZARD) {
      const session = await this.funnelAction.getLatestCompletedWizard(userId);
      if (!session) throw new UnprocessableEntityException(SYS_MSG.ONBOARDING_INCOMPLETE);

      const step1 = (session.answers?.step_1 ?? {}) as { business_description?: string };
      const step3 = (session.answers?.step_3 ?? {}) as { discovery_channel?: string };
      const user = await this.funnelAction.getUserProfile(userId);

      const businessName = this.coerceString(step1.business_description) || DEFAULT_BUSINESS_NAME;
      const businessContext: BusinessContext = {
        businessType: this.coerceString(user?.business_type) || 'unknown',
        discoveryChannel: this.coerceString(step3.discovery_channel) || 'unknown',
        business_name: businessName,
        business_description: this.coerceString(step1.business_description) || '',
        target_customer: this.coerceString(user?.target_customer) || '',
      };
      return { businessName, businessContext };
    }

    const ids = dto.upload_ids ?? [];
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length || uniqueIds.length === 0)
      throw new UnprocessableEntityException(SYS_MSG.UPLOAD_OWNERSHIP_INVALID);

    const docs = await this.funnelAction.getUploadedDocuments(userId, uniqueIds);
    if (docs.length !== uniqueIds.length) throw new UnprocessableEntityException(SYS_MSG.UPLOAD_OWNERSHIP_INVALID);
    if (docs.some((d) => d.status !== UploadDocumentStatus.READY))
      throw new UnprocessableEntityException(SYS_MSG.UPLOAD_NOT_READY);

    const parsedJoin = docs
      .map((d) => d.parsed_text ?? '')
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
    const businessName = this.deriveNameFromFiles(docs) || DEFAULT_BUSINESS_NAME;
    const businessContext: BusinessContext = {
      businessType: 'unknown',
      discoveryChannel: 'unknown',
      business_name: businessName,
      business_description: parsedJoin,
      target_customer: '',
    };
    return { businessName, businessContext };
  }

  private coerceString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private deriveNameFromFiles(docs: UploadedDocument[]): string {
    const first = docs[0]?.file_name;
    if (!first) return '';
    return first
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .slice(0, 100)
      .trim();
  }

  private buildStageCompletionResult(
    currentStage: FunnelStage,
    unlockedStage: FunnelStage | null,
  ): StageCompletionResult {
    return {
      completedStage: {
        stageId: currentStage.id,
        position: currentStage.position,
        name: currentStage.name,
        status: StageStatus.COMPLETE,
        completedAt: (currentStage.completed_at ?? new Date()).toISOString(),
      },
      unlockedStage: unlockedStage
        ? {
            stageId: unlockedStage.id,
            position: unlockedStage.position,
            name: unlockedStage.name,
            status: unlockedStage.status,
            unlockedAt: (unlockedStage.unlocked_at ?? new Date()).toISOString(),
          }
        : null,
    };
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const key = `ratelimit:funnel-generate:${userId}`;
    const { exceeded } = await this.redisService.rateLimit(key, 5, 3600);
    if (exceeded) throw new HttpException(SYS_MSG.GENERATION_RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
  }

  async updateTaskStatus(
    userId: string,
    funnelId: string,
    stageId: string,
    taskId: string,
    status: StageTaskStatus,
  ): Promise<TaskUpdateResult> {
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND);

    const stage = await this.stageAction.get({ identifierOptions: { id: stageId, funnel_id: funnelId } });
    if (!stage) throw new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND);

    if (stage.status === StageStatus.LOCKED) {
      const prior = await this.stageAction.get({
        identifierOptions: { funnel_id: funnelId, position: stage.position - 1 },
      });
      const priorName = prior ? prior.name : 'previous';
      throw new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE(stage.name, priorName));
    }

    const task = await this.taskAction.findOwnedTask(taskId, stageId);
    if (!task) throw new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND);

    if (task.status === status) {
      return this.buildTaskUpdateResult(task);
    }

    task.status = status;
    const saved = await this.taskAction.saveTask(task);

    if (status === 'complete') {
      emitSafely(
        this.eventEmitter,
        this.logger,
        APP_EVENTS.TASK_COMPLETED,
        new TaskCompletedEvent(userId, funnelId, stageId, taskId, saved.name),
      );
    } else {
      emitSafely(
        this.eventEmitter,
        this.logger,
        APP_EVENTS.TASK_REOPENED,
        new TaskReopenedEvent(userId, funnelId, stageId, taskId, saved.name),
      );
    }

    return this.buildTaskUpdateResult(saved);
  }

  private buildTaskUpdateResult(task: StageTask): TaskUpdateResult {
    return {
      taskId: task.id,
      name: task.name,
      status: task.status,
      isComplete: task.is_complete,
      completedAt: task.completed_at ? task.completed_at.toISOString() : null,
      position: task.position,
    };
  }

  async submitFeedback(
    userId: string,
    funnelId: string,
    stageId: string,
    dto: SubmitStageFeedbackDto,
  ): Promise<SubmitFeedbackResponse> {
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);

    const stage = await this.stageAction.get({ identifierOptions: { id: stageId, funnel_id: funnelId } });
    if (!stage) throw new NotFoundException(SYS_MSG.FUNNEL_STAGE_NOT_FOUND);

    if (stage.status !== StageStatus.COMPLETE) {
      throw new UnprocessableEntityException(SYS_MSG.FEEDBACK_STAGE_NOT_COMPLETE);
    }

    const existingFeedback = await this.feedbackAction.findExistingFeedback(userId, stageId);
    if (existingFeedback) {
      throw new ConflictException(SYS_MSG.FEEDBACK_ALREADY_SUBMITTED);
    }

    let feedback: StageFeedback;
    try {
      // Comment is sanitized and verified by DTO transform
      feedback = await this.feedbackAction.createFeedback(userId, funnelId, stageId, dto.comment);
    } catch (error: unknown) {
      // Postgres Error 23505 = unique_violation (Race condition catch)
      const dbError = error as { code?: string };
      if (dbError?.code === '23505') {
        throw new ConflictException(SYS_MSG.FEEDBACK_ALREADY_SUBMITTED);
      }
      throw error;
    }

    emitSafely(
      this.eventEmitter,
      this.logger,
      APP_EVENTS.FEEDBACK_SUBMITTED,
      new FeedbackSubmittedEvent(userId, funnelId, stageId, feedback.id),
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.FEEDBACK_SUBMITTED,
      data: {
        feedbackId: feedback.id,
        stageId: feedback.stage_id,
        comment: feedback.comment,
        submittedAt: (feedback.created_at ?? new Date()).toISOString(),
      },
    };
  }
}
