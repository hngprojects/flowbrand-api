import { OnQueueActive, OnQueueCompleted, OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bull';
import { DataSource } from 'typeorm';
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
const LLM_TIMEOUT_MS = 60_000;
const EXPECTED_STAGE_COUNT = 4;

@Processor(QUEUES.FUNNEL_GENERATION)
export class FunnelGenerationProcessor {
  private readonly logger = new Logger(FunnelGenerationProcessor.name);

  constructor(
    private readonly funnelAction: FunnelModelAction,
    private readonly llmService: LlmService,
    private readonly templateService: FunnelTemplateService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Process(JOBS.GENERATE_FUNNEL)
  async handleGenerateFunnel(job: Job<GenerateFunnelJobPayload>): Promise<void> {
    const { funnelId, userId, businessContext } = job.data;

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
      this.logger.error({ message: 'Funnel not found — aborting job', funnelId, jobId: job.id });
      return;
    }
    if (funnel.status === FunnelStatus.ACTIVE || funnel.status === FunnelStatus.FAILED) {
      this.logger.log({ message: `Funnel already ${funnel.status.toLowerCase()} — skipping`, funnelId, jobId: job.id });
      return;
    }

    await job.progress(10);

    try {
      let stageData = await this.tryAiGeneration(businessContext);

      if (!stageData) {
        this.logger.log({ message: 'AI failed — using template fallback', funnelId });
        stageData = this.templateService.getTemplate(businessContext);
      }

      this.validateStageData(stageData);

      await job.progress(70);

      await this.writeFunnelData(funnelId, stageData, job);

      await job.progress(100);

      this.logger.log({ message: 'Funnel generation complete', funnelId, jobId: job.id });
    } catch (err) {
      await this.funnelAction.update({
        identifierOptions: { id: funnelId },
        updatePayload: { status: FunnelStatus.FAILED },
        transactionOptions: { useTransaction: false },
      });
      throw err;
    }
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

    for (const stage of data) {
      for (const key of Object.keys(stage)) {
        if (!ALLOWED_STAGE_KEYS.has(key)) {
          throw new Error(`Stage ${stage.position}: unexpected field '${key}'`);
        }
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
  ): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    await job.progress(80);

    try {
      for (const sd of stageData) {
        await qr.manager.update(
          FunnelStage,
          { funnel_id: funnelId, position: sd.position },
          { channel: sd.channel, explanation: sd.explanation, action_prompt: sd.actionPrompt },
        );

        const stage = await qr.manager.findOne(FunnelStage, {
          where: { funnel_id: funnelId, position: sd.position },
        });

        if (!stage) {
          throw new Error(`Stage not found: funnelId=${funnelId} position=${sd.position}`);
        }

        const tasks = sd.tasks.map((t) =>
          qr.manager.create(StageTask, {
            stage_id: stage.id,
            task_text: t.taskText,
            name: t.taskText,
            is_complete: false,
            completed_at: null,
          }),
        );

        await qr.manager.save(StageTask, tasks);
      }

      await qr.manager.update(Funnel, { id: funnelId }, { status: FunnelStatus.ACTIVE });
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
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
  onFailed(job: Job<GenerateFunnelJobPayload>, error: Error): void {
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
  }

  @OnQueueStalled()
  onStalled(job: Job<GenerateFunnelJobPayload>): void {
    this.logger.warn({
      event: 'job_stalled',
      jobId: job.id,
      funnelId: job.data.funnelId,
      message: 'Bull will auto re-queue',
    });
  }
}
