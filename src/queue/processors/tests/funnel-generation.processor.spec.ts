import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { Job } from 'bull';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { FunnelFailedEvent, FunnelGeneratedEvent } from '../../../common/events';
import { FunnelModelAction } from '../../../modules/funnels/actions/funnel.action';
import { FunnelStatus } from '../../../modules/funnels/enums/funnel-status.enum';
import type {
  BusinessContext,
  GenerateFunnelJobPayload,
} from '../../../modules/funnels/interfaces/generate-funnel-job.interface';
import type { LlmStageData } from '../../../modules/funnels/interfaces/llm-stage-data.interface';
import { FunnelTemplateService } from '../../../modules/funnels/services/funnel-template.service';
import { LlmService } from '../../interfaces/llm.service.interface';
import { FunnelGenerationProcessor } from '../funnel-generation.processor';


// Mocks


const mockQueryRunner = {
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  manager: {
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(),
    create: jest.fn((_, data) => data),
    save: jest.fn().mockResolvedValue(undefined),
  },
};


const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};


const mockFunnelAction = {
  get: jest.fn(),
  update: jest.fn().mockResolvedValue(null),
};


const mockLlmService = {
  generateWithGemini: jest.fn(),
  generateWithGroq: jest.fn(),
};


const mockTemplateService = {
  getTemplate: jest.fn(),
};


const mockEventEmitter = { emit: jest.fn() };


// Helpers


const businessContext: BusinessContext = {
  businessType: 'bakery',
  discoveryChannel: 'Instagram',
};


function makeValidStageData(): LlmStageData[] {
  return [1, 2, 3, 4].map((position) => ({
    position,
    channel: 'Instagram',
    explanation: `Explanation for stage ${position}`,
    actionPrompt: `Action for stage ${position}`,
    tasks: [{ taskText: `Task A for stage ${position}` }, { taskText: `Task B for stage ${position}` }],
  }));
}


function makeJob(overrides: Partial<Job<GenerateFunnelJobPayload>> = {}): Job<GenerateFunnelJobPayload> {
  return {
    id: 'job-1',
    data: { funnelId: 'funnel-uuid', userId: 'user-uuid' },
    progress: jest.fn().mockResolvedValue(undefined),
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as unknown as Job<GenerateFunnelJobPayload>;
}


// Suite


describe('FunnelGenerationProcessor', () => {
  let module: TestingModule;
  let processor: FunnelGenerationProcessor;


  beforeEach(async () => {
    jest.clearAllMocks();


    // Default: funnel exists in GENERATING state with business_context
    mockFunnelAction.get.mockResolvedValue({
      id: 'funnel-uuid',
      status: FunnelStatus.GENERATING,
      funnel_name: 'Test Bakery',
      business_context: businessContext,
    });


    // Default: bulk stage fetch returns all 4 stages
    mockQueryRunner.manager.find.mockResolvedValue([
      { id: 'stage-1-uuid', position: 1 },
      { id: 'stage-2-uuid', position: 2 },
      { id: 'stage-3-uuid', position: 3 },
      { id: 'stage-4-uuid', position: 4 },
    ]);


    module = await Test.createTestingModule({
      providers: [
        FunnelGenerationProcessor,
        { provide: FunnelModelAction, useValue: mockFunnelAction },
        { provide: LlmService, useValue: mockLlmService },
        { provide: FunnelTemplateService, useValue: mockTemplateService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();


    processor = module.get<FunnelGenerationProcessor>(FunnelGenerationProcessor);
  });


  afterEach(async () => {
    await module.close();
  });


  // AC-01 / AC-07: Gemini success path


  describe('AC-01 — Gemini success path', () => {
    it('commits transaction and sets funnel to ACTIVE', async () => {
      const stageData = makeValidStageData();
      mockLlmService.generateWithGemini.mockResolvedValue(stageData);
      const job = makeJob();


      await processor.handleGenerateFunnel(job);


      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.update).toHaveBeenLastCalledWith(
        expect.anything(),
        { id: 'funnel-uuid' },
        { status: FunnelStatus.ACTIVE },
      );
    });


    it('AC-07: calls job.progress with 10, 70, 80, 100 in order', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      const job = makeJob();
      const progressCalls: number[] = [];
      (job.progress as jest.Mock).mockImplementation((v: number) => {
        progressCalls.push(v);
        return Promise.resolve();
      });


      await processor.handleGenerateFunnel(job);


      expect(progressCalls).toEqual([10, 70, 80, 100]);
    });
  });


  // AC-02: Groq fallback


  describe('AC-02 — Groq fallback', () => {
    it('falls back to Groq when Gemini throws and still completes', async () => {
      const stageData = makeValidStageData();
      mockLlmService.generateWithGemini.mockRejectedValue(new Error('Gemini down'));
      mockLlmService.generateWithGroq.mockResolvedValue(stageData);


      await processor.handleGenerateFunnel(makeJob());


      expect(mockLlmService.generateWithGroq).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });
  });


  // AC-03: Template fallback


  describe('AC-03 — Template fallback', () => {
    it('uses template when both Gemini and Groq fail', async () => {
      mockLlmService.generateWithGemini.mockRejectedValue(new Error('Gemini down'));
      mockLlmService.generateWithGroq.mockRejectedValue(new Error('Groq down'));
      mockTemplateService.getTemplate.mockReturnValue(makeValidStageData());


      await processor.handleGenerateFunnel(makeJob());


      expect(mockTemplateService.getTemplate).toHaveBeenCalledWith(businessContext, 'user-uuid');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });
  });


  // AC-04 / AC-09: DB failure + rollback + release


  describe('AC-04 — DB failure triggers rollback', () => {
    it('rolls back and rethrows without writing FAILED (onFailed owns that)', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      mockQueryRunner.manager.update.mockRejectedValueOnce(new Error('DB error'));


      await expect(processor.handleGenerateFunnel(makeJob({ attemptsMade: 2 }))).rejects.toThrow('DB error');


      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockFunnelAction.update).not.toHaveBeenCalled();
    });


    it('never writes FAILED on a non-last attempt either', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      mockQueryRunner.manager.update.mockRejectedValueOnce(new Error('DB error'));


      await expect(processor.handleGenerateFunnel(makeJob({ attemptsMade: 0 }))).rejects.toThrow('DB error');


      expect(mockFunnelAction.update).not.toHaveBeenCalled();
    });


    it('AC-09: queryRunner.release() is always called even when rollback fires', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      mockQueryRunner.manager.update.mockRejectedValueOnce(new Error('DB error'));


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow();


      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });


  // AC-06: Full failure rethrows; state write delegated to onFailed


  describe('AC-06 — Full failure', () => {
    it('rethrows the error without writing FAILED when all providers and template fail', async () => {
      mockLlmService.generateWithGemini.mockRejectedValue(new Error('Gemini down'));
      mockLlmService.generateWithGroq.mockRejectedValue(new Error('Groq down'));
      mockTemplateService.getTemplate.mockImplementation(() => {
        throw new Error('Template broken');
      });


      await expect(processor.handleGenerateFunnel(makeJob({ attemptsMade: 2 }))).rejects.toThrow('Template broken');


      expect(mockFunnelAction.update).not.toHaveBeenCalled();
    });
  });


  // AC-08: LLM output validation


  describe('AC-08 — LLM output validation', () => {
    it('logs funnel_stage_validation_failed with the failing rule before rethrowing', async () => {
      const invalid = makeValidStageData();
      invalid[0].explanation = 'x'.repeat(2001);
      mockLlmService.generateWithGemini.mockResolvedValue(invalid);
      const warnSpy = jest.spyOn((processor as any).logger, 'warn');


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/exceeds 2000/);


      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'funnel_stage_validation_failed',
          funnelId: 'funnel-uuid',
          rule: expect.stringMatching(/exceeds 2000/),
        }),
      );
    });


    it('rejects explanation > 2000 chars before DB write', async () => {
      const invalid = makeValidStageData();
      invalid[0].explanation = 'x'.repeat(2001);
      mockLlmService.generateWithGemini.mockResolvedValue(invalid);


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/exceeds 2000/);


      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });


    it('rejects actionPrompt > 2000 chars before DB write', async () => {
      const invalid = makeValidStageData();
      invalid[1].actionPrompt = 'y'.repeat(2001);
      mockLlmService.generateWithGemini.mockResolvedValue(invalid);


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/exceeds 2000/);
    });


    it('rejects LLM output with wrong number of stages', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData().slice(0, 3));


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/expected 4 stages/);
    });


    it('rejects unexpected fields in stage data', async () => {
      const invalid = makeValidStageData() as unknown as Record<string, unknown>[];
      (invalid[0] as Record<string, unknown>)['injectedField'] = 'DROP TABLE funnels';
      mockLlmService.generateWithGemini.mockResolvedValue(invalid);


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/unexpected field/);
    });
  });


  // EC-06: Funnel not found throws so Bull retries


  describe('EC-06 — Funnel not found', () => {
    it('throws so Bull retries instead of silently completing the job', async () => {
      mockFunnelAction.get.mockResolvedValue(null);


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/not found/);


      expect(mockLlmService.generateWithGemini).not.toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });
  });


  // EC-05: Idempotency guard


  describe('EC-05 — Idempotency guard', () => {
    it('returns early without calling LLM when funnel is already ACTIVE', async () => {
      mockFunnelAction.get.mockResolvedValue({ id: 'funnel-uuid', status: FunnelStatus.ACTIVE });


      await processor.handleGenerateFunnel(makeJob());


      expect(mockLlmService.generateWithGemini).not.toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });


    it('returns early without calling LLM when funnel is already FAILED', async () => {
      mockFunnelAction.get.mockResolvedValue({ id: 'funnel-uuid', status: FunnelStatus.FAILED });


      await processor.handleGenerateFunnel(makeJob());


      expect(mockLlmService.generateWithGemini).not.toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });
  });


  describe('EC-04 — Stage record not found triggers rollback', () => {
    it('rolls back if a stage is missing from funnel_stages', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      // Return only 3 stages — position 2 is missing from the DB, so stageMap.get(2) is undefined
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        { id: 'stage-1-uuid', position: 1 },
        { id: 'stage-3-uuid', position: 3 },
        { id: 'stage-4-uuid', position: 4 },
      ]);


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow(/Stage not found/);


      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });


  // onFailed — terminal state writes


  describe('onFailed — terminal state writes', () => {
    it('marks funnel FAILED when all attempts are exhausted and funnel is not ACTIVE', async () => {
      const job = makeJob({ attemptsMade: 3 });
      mockFunnelAction.get.mockResolvedValue({ id: 'funnel-uuid', status: FunnelStatus.GENERATING });


      await processor.onFailed(job, new Error('boom'));


      expect(mockFunnelAction.update).toHaveBeenCalledWith(
        expect.objectContaining({ updatePayload: { status: FunnelStatus.FAILED } }),
      );
    });


    it('does not write FAILED when willRetry is true', async () => {
      const job = makeJob({ attemptsMade: 1 });


      await processor.onFailed(job, new Error('transient'));


      expect(mockFunnelAction.get).not.toHaveBeenCalled();
      expect(mockFunnelAction.update).not.toHaveBeenCalled();
    });


    it('skips FAILED write and logs warning when funnel is already ACTIVE', async () => {
      const job = makeJob({ attemptsMade: 3 });
      mockFunnelAction.get.mockResolvedValue({ id: 'funnel-uuid', status: FunnelStatus.ACTIVE });
      const warnSpy = jest.spyOn((processor as any).logger, 'warn');


      await processor.onFailed(job, new Error('boom'));


      expect(mockFunnelAction.update).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'funnel_job_failed_skip' }));
    });


    it('does not throw when the FAILED DB update itself fails', async () => {
      const job = makeJob({ attemptsMade: 3 });
      mockFunnelAction.get.mockResolvedValue({ id: 'funnel-uuid', status: FunnelStatus.GENERATING });
      mockFunnelAction.update.mockRejectedValueOnce(new Error('DB down'));


      await expect(processor.onFailed(job, new Error('boom'))).resolves.toBeUndefined();
    });
  });


  // onStalled — observability only


  describe('onStalled — observability only', () => {
    it('logs funnel_job_stalled with attemptsMade and does not write any state', () => {
      const warnSpy = jest.spyOn((processor as any).logger, 'warn');
      const job = makeJob({ attemptsMade: 1 });


      processor.onStalled(job);


      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'funnel_job_stalled', attemptsMade: 1 }));
      expect(mockFunnelAction.update).not.toHaveBeenCalled();
    });
  });


  // Event emission


  describe('Event emission — FUNNEL_GENERATED', () => {
    it('AC-04: emits FUNNEL_GENERATED after successful DB commit', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());


      await processor.handleGenerateFunnel(makeJob());


      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.FUNNEL_GENERATED,
        expect.objectContaining({ userId: 'user-uuid', funnelId: 'funnel-uuid' }),
      );
    });


    it('AC-05: emitted payload is a FunnelGeneratedEvent instance with correct fields', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());


      await processor.handleGenerateFunnel(makeJob());


      const [, payload] = (mockEventEmitter.emit as jest.Mock).mock.calls[0];
      expect(payload).toBeInstanceOf(FunnelGeneratedEvent);
      expect(payload.funnelName).toBe('Test Bakery');
    });


    it('AC-08: does NOT emit FUNNEL_GENERATED when writeFunnelData throws', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      mockQueryRunner.manager.update.mockRejectedValueOnce(new Error('DB write failed'));


      await expect(processor.handleGenerateFunnel(makeJob())).rejects.toThrow('DB write failed');


      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(APP_EVENTS.FUNNEL_GENERATED, expect.anything());
    });


    it('AC-09: a throwing FUNNEL_GENERATED listener does not fail the job or mark funnel FAILED', async () => {
      mockLlmService.generateWithGemini.mockResolvedValue(makeValidStageData());
      mockEventEmitter.emit.mockImplementationOnce((eventName: string) => {
        if (eventName === APP_EVENTS.FUNNEL_GENERATED) throw new Error('listener crashed');
      });


      await expect(processor.handleGenerateFunnel(makeJob())).resolves.toBeUndefined();
      expect(mockFunnelAction.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ updatePayload: { status: FunnelStatus.FAILED } }),
      );
    });
  });


  describe('Event emission — FUNNEL_FAILED', () => {
    it('emits FUNNEL_FAILED in onFailed when no retries remain', async () => {
      // Bull increments attemptsMade before firing onFailed, so the final attempt has attemptsMade === maxAttempts
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });


      await processor.onFailed(job, new Error('LLM down'));


      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.FUNNEL_FAILED,
        expect.objectContaining({ userId: 'user-uuid', funnelId: 'funnel-uuid' }),
      );
    });


    it('emitted FUNNEL_FAILED payload is a FunnelFailedEvent instance', async () => {
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });


      await processor.onFailed(job, new Error('LLM down'));


      const [, payload] = (mockEventEmitter.emit as jest.Mock).mock.calls[0];
      expect(payload).toBeInstanceOf(FunnelFailedEvent);
    });


    it('does NOT emit FUNNEL_FAILED in onFailed when retries remain', async () => {
      const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });


      await processor.onFailed(job, new Error('LLM down'));


      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(APP_EVENTS.FUNNEL_FAILED, expect.anything());
    });
  });


  // Hook logging


  describe('Hook logging', () => {
    it('FR-11: onCompleted logs duration', () => {
      const loggerSpy = jest.spyOn((processor as any).logger, 'log');
      const job = makeJob({
        processedOn: 1000,
        finishedOn: 2500,
      });


      processor.onCompleted(job);


      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'funnel_job_completed',
          duration: 1500,
        }),
      );
    });
  });
});