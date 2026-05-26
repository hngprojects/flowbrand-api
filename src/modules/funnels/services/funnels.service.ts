import { InjectQueue } from '@nestjs/bull';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { DataSource, In, Repository } from 'typeorm';
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import * as SYS_MSG from '../../../constants/system.messages';
import { WizardSession } from '../../onboarding/entities/wizzard-session.entity';
import { WizardStatus } from '../../onboarding/enums/wizzard-status.enum';
import { RedisService } from '../../redis/redis.service';
import { UploadedDocument } from '../../upload/entities/uploaded-document.entity';
import { UploadDocumentStatus } from '../../upload/upload.types';
import { FunnelModelAction } from '../actions/funnel.action';
import { CreateFunnelDto } from '../dto/create-funnel.dto';
import { Funnel } from '../entities/funnel.entity';
import { FunnelStage } from '../entities/funnel-stage.entity';
import { FunnelCreationPath } from '../enums/funnel-creation-path.enum';
import { FunnelStatus } from '../enums/funnel-status.enum';
import { StageStatus } from '../enums/stage-status.enum';
import type {
  BusinessContext,
  GenerateFunnelJobPayload,
} from '../interfaces/generate-funnel-job.interface';

const STAGE_NAMES = ['Get Noticed', 'Spark Interest', 'Make First Sale', 'Bring Them Back'] as const;
const QUEUE_DELAY_MS = 250;
const DEFAULT_BUSINESS_NAME = 'My Business';

export interface FunnelGenerationCreateResult {
  statusCode: HttpStatus;
  message: string;
  funnelId: string;
  status: FunnelStatus;
}

export interface FunnelStatusResult {
  funnelId: string;
  status: FunnelStatus;
  redirect?: { to: string };
  error?: { code: string; message: string; retry_endpoint: string };
}

export interface StageCompletionResult {
  completedStage: {
    stageId: string;
    position: number;
    name: string;
    status: StageStatus;
    completedAt: string;
  };
  unlockedStage: {
    stageId: string;
    position: number;
    name: string;
    status: StageStatus;
    unlockedAt: string;
  } | null;
}

@Injectable()
export class FunnelsService {
  private readonly logger = new Logger(FunnelsService.name);

  constructor(
    private readonly funnelAction: FunnelModelAction,
    private readonly redisService: RedisService,
    @InjectRepository(WizardSession)
    private readonly wizardRepo: Repository<WizardSession>,
    @InjectRepository(UploadedDocument)
    private readonly uploadRepo: Repository<UploadedDocument>,
    @InjectQueue(QUEUES.FUNNEL_GENERATION) private readonly queue: Queue<GenerateFunnelJobPayload>,
    private readonly dataSource: DataSource,
  ) {}

  // POST /funnels/generate — idempotent funnel creation + queue dispatch.
  async createGeneration(userId: string, dto: CreateFunnelDto): Promise<FunnelGenerationCreateResult> {
    // 1. Idempotency: same key + user returns the existing funnel.
    const existing = await this.funnelAction.findByIdempotency(userId, dto.idempotency_key);
    if (existing) {
      return {
        statusCode: HttpStatus.OK,
        message: SYS_MSG.FUNNEL_ALREADY_EXISTS,
        funnelId: existing.id,
        status: existing.status,
      };
    }

    // 2. Concurrent-generation guard (AC-03).
    const inflight = await this.funnelAction.findGeneratingForUser(userId);
    if (inflight) {
      throw new ConflictException(SYS_MSG.GENERATION_IN_PROGRESS);
    }

    // 3. Rate limit — only charged for genuine new generation attempts.
    await this.checkRateLimit(userId);

    // 4. Source-specific validation + business context derivation.
    const { businessName, businessContext } = await this.validateSourceAndDeriveContext(
      userId,
      dto,
    );

    // 5. Transaction: insert funnel + 4 stages, dispatch queue job
    //    BEFORE commit. Any failure rolls back DB.
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

      // Dispatch BEFORE commit per BE-305 AC-09 wording. Small `delay`
      // avoids the race where a worker picks up the job before the
      // transaction commits.
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

  // GET /funnels/generate/status/:funnelId — owner-scoped, fast lookup.
  async getStatus(funnelId: string, userId: string): Promise<FunnelStatusResult> {
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) {
      // SEC-01: do not reveal existence of cross-user funnels.
      throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);
    }

    const base = { funnelId: funnel.id, status: funnel.status };

    if (funnel.status === FunnelStatus.ACTIVE) {
      return { ...base, redirect: { to: 'strategy_dashboard' } };
    }
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
    const funnel = await this.funnelAction.findOwnedById(funnelId, userId);
    if (!funnel) {
      throw new NotFoundException(SYS_MSG.FUNNEL_NOT_FOUND);
    }

    if (funnel.status !== FunnelStatus.ACTIVE) {
      throw new UnprocessableEntityException('Funnel must be active before a stage can be completed.');
    }

    const stageRepository = this.dataSource.getRepository(FunnelStage);
    const currentStage = await stageRepository.findOne({ where: { id: stageId, funnel_id: funnelId } });

    if (!currentStage) {
      throw new NotFoundException(SYS_MSG.FUNNEL_OR_STAGE_NOT_FOUND);
    }

    if (currentStage.status === StageStatus.COMPLETE) {
      const unlockedStage = await stageRepository.findOne({
        where: { funnel_id: funnelId, position: currentStage.position + 1 },
      });

      return {
        statusCode: HttpStatus.OK,
        message: SYS_MSG.STAGE_ALREADY_COMPLETE,
        data: this.buildStageCompletionResult(currentStage, unlockedStage),
      };
    }

    if (currentStage.status === StageStatus.LOCKED) {
      const priorStage = await stageRepository.findOne({
        where: { funnel_id: funnelId, position: currentStage.position - 1 },
      });
      const priorName = priorStage?.name ?? 'previous';
      throw new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE(currentStage.name, priorName));
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const taskCounts = await this.funnelAction.countTasksForStage(queryRunner.manager, stageId);

      const totalTasks = Number(taskCounts.total ?? 0);
      const pendingTasks = Number(taskCounts.pending ?? 0);

      if (totalTasks === 0) {
        throw new UnprocessableEntityException(SYS_MSG.STAGE_HAS_NO_TASKS);
      }

      if (pendingTasks > 0) {
        throw new UnprocessableEntityException(SYS_MSG.STAGE_HAS_PENDING_TASKS(pendingTasks));
      }

      const completedAt = new Date();
      const affected = await this.funnelAction.updateStageStatusIfActive(
        queryRunner.manager,
        stageId,
        funnelId,
        { status: StageStatus.COMPLETE, completed_at: completedAt },
      );

      if (affected === 0) {
        const latestStage = await this.funnelAction.findStageById(queryRunner.manager, stageId, funnelId);
        const unlockedStage = await this.funnelAction.findNextStage(queryRunner.manager, funnelId, currentStage.position + 1);

        await queryRunner.rollbackTransaction();

        if (latestStage?.status === StageStatus.COMPLETE) {
          return {
            statusCode: HttpStatus.OK,
            message: SYS_MSG.STAGE_ALREADY_COMPLETE,
            data: this.buildStageCompletionResult(latestStage, unlockedStage),
          };
        }

        throw new ConflictException('Stage completion failed due to a concurrent update. Please retry.');
      }

      const nextStage = await this.funnelAction.findNextStage(queryRunner.manager, funnelId, currentStage.position + 1);

      if (nextStage) {
        await queryRunner.manager.update(
          FunnelStage,
          { id: nextStage.id, funnel_id: funnelId, status: StageStatus.LOCKED },
          { status: StageStatus.ACTIVE, unlocked_at: completedAt },
        );
      }

      await queryRunner.commitTransaction();

      const unlockedStage = nextStage
        ? await stageRepository.findOne({ where: { id: nextStage.id, funnel_id: funnelId } })
        : null;

      return {
        statusCode: HttpStatus.OK,
        message: SYS_MSG.STAGE_COMPLETED_SUCCESSFULLY,
        data: this.buildStageCompletionResult(
          {
            ...currentStage,
            status: StageStatus.COMPLETE,
            completed_at: completedAt,
          },
          unlockedStage,
        ),
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Validates the requested source and pulls together the BusinessContext.
  private async validateSourceAndDeriveContext(
    userId: string,
    dto: CreateFunnelDto,
  ): Promise<{ businessName: string; businessContext: BusinessContext }> {
    if (dto.source === FunnelCreationPath.WIZARD) {
      const session = await this.wizardRepo.findOne({
        where: { user_id: userId, status: WizardStatus.COMPLETE },
        order: { updated_at: 'DESC' },
      });

      if (!session) {
        throw new UnprocessableEntityException(SYS_MSG.ONBOARDING_INCOMPLETE);
      }

      const answers: Record<string, unknown> = session.answers ?? {};
      const businessName = this.coerceString(answers.business_name) || DEFAULT_BUSINESS_NAME;
      const businessContext: BusinessContext = {
        businessType: this.coerceString(answers.business_type) || 'unknown',
        discoveryChannel: this.coerceString(answers.discovery_channel) || 'unknown',
        business_name: businessName,
        business_description: this.coerceString(answers.business_description) || '',
        target_customer: this.coerceString(answers.target_customer) || '',
      };

      return { businessName, businessContext };
    }

    // source === DOCUMENT_UPLOAD
    const ids = dto.upload_ids ?? [];
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      throw new UnprocessableEntityException(SYS_MSG.UPLOAD_OWNERSHIP_INVALID);
    }
    if (uniqueIds.length === 0) {
      throw new UnprocessableEntityException(SYS_MSG.UPLOAD_NOT_READY);
    }

    const docs = await this.uploadRepo.find({ where: { id: In(uniqueIds), user_id: userId } });
    if (docs.length !== uniqueIds.length) {
      throw new UnprocessableEntityException(SYS_MSG.UPLOAD_OWNERSHIP_INVALID);
    }

    if (docs.some((d) => d.status !== UploadDocumentStatus.READY)) {
      throw new UnprocessableEntityException(SYS_MSG.UPLOAD_NOT_READY);
    }

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
    return first.replace(/\.[a-zA-Z0-9]+$/, '').slice(0, 100).trim();
  }

  private buildStageCompletionResult(currentStage: FunnelStage, unlockedStage: FunnelStage | null): StageCompletionResult {
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
            status: StageStatus.ACTIVE,
            unlockedAt: (unlockedStage.unlocked_at ?? new Date()).toISOString(),
          }
        : null,
    };
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const key = `ratelimit:funnel-generate:${userId}`;
    const { exceeded } = await this.redisService.rateLimit(key, 5, 3600);
    if (exceeded) {
      throw new HttpException(SYS_MSG.GENERATION_RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
