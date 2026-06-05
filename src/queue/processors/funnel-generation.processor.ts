import { OnQueueActive, OnQueueCompleted, OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bull';
import { DataSource, QueryFailedError } from 'typeorm';
import { APP_EVENTS } from '../../common/constants/app-events';
import { emitSafely, FunnelFailedEvent, FunnelGeneratedEvent } from '../../common/events';
import { JOBS, QUEUES } from '../../common/constants/queue.constants';
import { FunnelModelAction } from '../../modules/funnels/actions/funnel.action';
import { Funnel } from '../../modules/funnels/entities/funnel.entity';
import { FunnelStage } from '../../modules/funnels/entities/funnel-stage.entity';
import { StageTask } from '../../modules/funnels/entities/stage-task.entity';
import { FunnelStatus } from '../../modules/funnels/enums/funnel-status.enum';
import type {
  BusinessContext,
  GenerateFunnelJobPayload,
} from '../../modules/funnels/interfaces/generate-funnel-job.interface';
import type { LlmStageData } from '../../modules/funnels/interfaces/llm-stage-data.interface';
import { FunnelTemplateService } from '../../modules/funnels/services/funnel-template.service';
import { LlmService } from '../interfaces/llm.service.interface';

const ALLOWED_STAGE_KEYS = new Set(['position', 'channel', 'explanation', 'actionPrompt', 'tasks']);
const MAX_FIELD_LENGTH = 2000;
const LLM_TIMEOUT_MS = 45_000;
const EXPECTED_STAGE_COUNT = 4;

@Processor(QUEUES.FUNNEL_GENERATION)
export class FunnelGenerationProcessor {
  private readonly logger = new Logger(FunnelGenerationProcessor.name);

  constructor(
    private readonly funnelAction: FunnelModelAction,
    private readonly llmService: LlmService,
    private readonly templateService: FunnelTemplateService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process(JOBS.GENERATE_FUNNEL)
  async handleGenerateFunnel(job: Job<GenerateFunnelJobPayload>): Promise<void> {
    const { funnelId, userId } = job.data;

    this.logger.log({
      message: 'Processing funnel generation job',
      funnelId,
      userId,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    // EC-05: skip if already completed (idempotency guard against duplicate delivery)
    const funnel = await this.funnelAction.get({ identifierOptions: { id: funnelId } });
    if (!funnel) {
      this.logger.warn({
        message: 'Funnel not found — likely deleted during generation; aborting job',
        funnelId,
        jobId: job.id,
      });
      return;
    }
    if (funnel.status === FunnelStatus.ACTIVE || funnel.status === FunnelStatus.FAILED) {
      this.logger.log({ message: `Funnel already ${funnel.status.toLowerCase()} — skipping`, funnelId, jobId: job.id });
      return;
    }

    const businessContext = funnel.business_context as BusinessContext;

    await job.progress(10);

    let stageData = await this.tryAiGeneration(businessContext);

    if (!stageData) {
      this.logger.log({ message: 'AI failed — using template fallback', funnelId });
      stageData = this.templateService.getTemplate(businessContext, userId);
    }

    try {
      this.validateStageData(stageData);
    } catch (validationErr) {
      this.logger.warn({
        event: 'funnel_stage_validation_failed',
        funnelId,
        jobId: job.id,
        rule: (validationErr as Error).message,
      });
      throw validationErr;
    }

    await job.progress(70);

    const wrote = await this.writeFunnelData(funnelId, stageData, job);
    if (!wrote) {
      this.logger.warn({
        message: 'Funnel removed before generation write — aborting job',
        funnelId,
        jobId: job.id,
      });
      return;
    }

    await job.progress(100);

    this.logger.log({ message: 'Funnel generation complete', funnelId, jobId: job.id });
    emitSafely(this.eventEmitter, this.logger, APP_EVENTS.FUNNEL_GENERATED, new FunnelGeneratedEvent(userId, funnelId, funnel.funnel_name));
  }

  private async tryAiGeneration(ctx: BusinessContext): Promise<LlmStageData[] | null> {
    try {
      let geminiTimerId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        geminiTimerId = setTimeout(() => reject(new Error('Gemini timeout')), LLM_TIMEOUT_MS);
      });
      try {
        return await Promise.race([this.llmService.generateWithGemini(ctx), timeout]);
      } finally {
        clearTimeout(geminiTimerId!);
      }
    } catch (err) {
      this.logger.warn({ message: 'Gemini failed', error: (err as Error).message });
    }

    try {
      let groqTimerId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        groqTimerId = setTimeout(() => reject(new Error('Groq timeout')), LLM_TIMEOUT_MS);
      });
      try {
        return await Promise.race([this.llmService.generateWithGroq(ctx), timeout]);
      } finally {
        clearTimeout(groqTimerId!);
      }
    } catch (err) {
      this.logger.warn({ message: 'Groq failed', error: (err as Error).message });
    }

    return null;
  }

  private validateStageData(data: LlmStageData[]): void {
    if (!Array.isArray(data) || data.length !== EXPECTED_STAGE_COUNT) {
      const actual = Array.isArray(data) ? data.length : typeof data;
      throw new Error(`LLM output invalid: expected ${EXPECTED_STAGE_COUNT} stages, got ${actual}`);
    }

    const positions = new Set<number>();

    for (const stage of data) {
      for (const key of Object.keys(stage)) {
        if (!ALLOWED_STAGE_KEYS.has(key)) {
          throw new Error(`Stage ${stage.position}: unexpected field '${key}'`);
        }
      }

      if (typeof stage.position !== 'number' || stage.position < 1 || stage.position > EXPECTED_STAGE_COUNT) {
        throw new Error(`Stage has invalid position: ${stage.position}`);
      }
      if (positions.has(stage.position)) {
        throw new Error(`Duplicate position in stage data: ${stage.position}`);
      }
      positions.add(stage.position);

      if (!stage.channel || typeof stage.channel !== 'string') {
        throw new Error(`Stage ${stage.position}: channel is required`);
      }
      if (!Array.isArray(stage.tasks)) {
        throw new Error(`Stage ${stage.position}: tasks must be an array`);
      }
      for (const task of stage.tasks) {
        if (!task.taskText || typeof task.taskText !== 'string') {
          throw new Error(`Stage ${stage.position}: task missing taskText`);
        }
      }

      if (typeof stage.explanation !== 'string') {
        throw new Error(`Stage ${stage.position}: explanation must be a string`);
      }
      if (typeof stage.actionPrompt !== 'string') {
        throw new Error(`Stage ${stage.position}: actionPrompt must be a string`);
      }
      if (stage.explanation.length > MAX_FIELD_LENGTH) {
        throw new Error(`Stage ${stage.position}: explanation exceeds ${MAX_FIELD_LENGTH} chars`);
      }
      if (stage.actionPrompt.length > MAX_FIELD_LENGTH) {
        throw new Error(`Stage ${stage.position}: actionPrompt exceeds ${MAX_FIELD_LENGTH} chars`);
      }
    }
  }

  private async writeFunnelData(
    funnelId: string,
    stageData: LlmStageData[],
    job: Job<GenerateFunnelJobPayload>,
  ): Promise<boolean> {
    await job.progress(80);

    const funnelStillExists = await this.funnelAction.get({ identifierOptions: { id: funnelId } });
    if (!funnelStillExists) {
      return false;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const stages = await qr.manager.find(FunnelStage, { where: { funnel_id: funnelId } });
      if (stages.length === 0) {
        const funnelExists = await qr.manager.findOne(Funnel, { where: { id: funnelId } });
        await qr.rollbackTransaction();
        if (!funnelExists) {
          return false;
        }
        throw new Error(`Funnel ${funnelId} has no stages — generation cannot complete`);
      }
      const stageMap = new Map(stages.map((s) => [s.position, s]));

      for (const sd of stageData) {
        await qr.manager.update(
          FunnelStage,
          { funnel_id: funnelId, position: sd.position },
          { channel: sd.channel, explanation: sd.explanation, action_prompt: sd.actionPrompt },
        );
      }

      const allTasks = stageData.flatMap((sd) => {
        const stage = stageMap.get(sd.position);
        if (!stage) {
          throw new Error(`Stage not found: funnelId=${funnelId} position=${sd.position}`);
        }
        return sd.tasks.map((t, taskIdx) =>
          qr.manager.create(StageTask, {
            stage_id: stage.id,
            task_text: t.taskText,
            name: t.taskText.slice(0, 80),
            position: taskIdx + 1,
            is_complete: false,
            completed_at: null,
          }),
        );
      });

      await qr.manager.save(StageTask, allTasks);
      const activateResult = await qr.manager.update(Funnel, { id: funnelId }, { status: FunnelStatus.ACTIVE });
      if ((activateResult.affected ?? 0) === 0) {
        await qr.rollbackTransaction();
        return false;
      }
      await qr.commitTransaction();
      return true;
    } catch (err) {
      await qr.rollbackTransaction();
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23503'
      ) {
        this.logger.warn({
          message: 'Funnel generation write skipped — funnel or stages no longer exist',
          funnelId,
          error: (err as Error).message,
        });
        return false;
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  @OnQueueActive()
  onActive(job: Job<GenerateFunnelJobPayload>): void {
    this.logger.log({
      event: 'funnel_job_active',
      jobId: job.id,
      funnelId: job.data.funnelId,
      attempt: job.attemptsMade + 1,
    });
  }

  @OnQueueCompleted()
  onCompleted(job: Job<GenerateFunnelJobPayload>): void {
    const duration = (job.finishedOn ?? Date.now()) - (job.processedOn ?? Date.now());
    this.logger.log({
      event: 'funnel_job_completed',
      jobId: job.id,
      funnelId: job.data.funnelId,
      duration,
    });
  }

  @OnQueueFailed()
  async onFailed(job: Job<GenerateFunnelJobPayload>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 3;
    const willRetry = job.attemptsMade < maxAttempts;

    this.logger.error({
      event: 'funnel_job_failed',
      jobId: job.id,
      funnelId: job.data.funnelId,
      error: error.message,
      attemptsMade: job.attemptsMade,
      maxAttempts,
      willRetry,
    });

    if (!willRetry) {
      try {
        const funnel = await this.funnelAction.get({
          identifierOptions: { id: job.data.funnelId },
        });
        if (!funnel) {
          this.logger.warn({
            event: 'funnel_job_failed_skip',
            funnelId: job.data.funnelId,
            message: 'Funnel no longer exists — skipping FAILED status write',
          });
          return;
        }
        if (funnel.status === FunnelStatus.ACTIVE) {
          this.logger.warn({
            event: 'funnel_job_failed_skip',
            funnelId: job.data.funnelId,
            message: 'Funnel already ACTIVE — not overwriting',
          });
          return;
        }
        await this.funnelAction.update({
          identifierOptions: { id: job.data.funnelId },
          updatePayload: { status: FunnelStatus.FAILED },
          transactionOptions: { useTransaction: false },
        });
        emitSafely(
          this.eventEmitter,
          this.logger,
          APP_EVENTS.FUNNEL_FAILED,
          new FunnelFailedEvent(job.data.userId, job.data.funnelId),
        );
      } catch (dbErr) {
        this.logger.error({
          event: 'funnel_failed_state_write_error',
          funnelId: job.data.funnelId,
          error: (dbErr as Error).message,
          message: 'Could not mark funnel FAILED — manual reconciliation required',
        });
      }
    }
  }

  @OnQueueStalled()
  onStalled(job: Job<GenerateFunnelJobPayload>): void {
    this.logger.warn({
      event: 'funnel_job_stalled',
      jobId: job.id,
      funnelId: job.data.funnelId,
      attemptsMade: job.attemptsMade,
      message: 'Bull will auto re-queue — state not modified here',
    });
  }
}
