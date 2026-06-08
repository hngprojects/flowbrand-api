import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { JOBS, QUEUES } from '../../../../common/constants/queue.constants';
import { APP_EVENTS } from '../../../../common/constants/app-events';
import { FunnelDeletedEvent } from '../../../../common/events/events';
import * as SYS_MSG from '../../../../constants/system.messages';
import { WizardSession } from '../../../onboarding/entities/wizzard-session.entity';
import { WizardStatus } from '../../../onboarding/enums/wizzard-status.enum';
import { RedisService } from '../../../redis/redis.service';
import { UploadDocumentStatus } from '../../../upload/upload.types';
import { FunnelModelAction } from '../.././actions/funnel.action';
import { FunnelStageModelAction } from '../.././actions/funnel-stage.action';
import { StageTaskModelAction } from '../.././actions/stage-task.action';
import { Funnel } from '../.././entities/funnel.entity';
import { FunnelStage } from '../.././entities/funnel-stage.entity';
import { FunnelCreationPath } from '../.././enums/funnel-creation-path.enum';
import { FunnelStatus } from '../.././enums/funnel-status.enum';
import { FunnelRenamedEvent } from '../../../../common/events/events';
import { FunnelsService } from '.././funnels.service';
import { Logger } from '@nestjs/common';
import { StageFeedbackModelAction } from '../../actions/stage-feedback.action';
import { StageFeedback } from '../../entities/stage-feedback.entity';
import { LlmService } from '../../../../queue/interfaces/llm.service.interface';
import { LogService } from '../../../../common/services/log.service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';
const FUNNEL_ID = '22222222-2222-4222-8222-222222222222';

const BASE_DTO = {
  source: FunnelCreationPath.WIZARD,
  idempotency_key: IDEMPOTENCY_KEY,
};

const mockLlmService = {
  generateFunnelNameWithGemini: jest.fn(),
  generateFunnelNameWithGroq: jest.fn(),
};

const COMPLETE_WIZARD: Partial<WizardSession> = {
  id: 'wsess-1',
  user_id: USER_ID,
  status: WizardStatus.COMPLETE,
  answers: {
    step_1: { business_description: 'Casual jollof spot' },
    step_2: { customer_tags: { type: ['office workers'] }, additional_notes: '' },
    step_3: { discovery_channel: 'Instagram' },
  },
};

describe('FunnelsService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });
  let service: FunnelsService;
  let funnelAction: jest.Mocked<FunnelModelAction>;
  let stageAction: jest.Mocked<FunnelStageModelAction>;
  let taskAction: jest.Mocked<StageTaskModelAction>;
  let redisService: { rateLimit: jest.Mock };
  let queue: { add: jest.Mock };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    isTransactionActive: boolean;
    manager: { save: jest.Mock; create: jest.Mock };
  };
  let dataSource: { createQueryRunner: jest.Mock };
  let feedbackAction: jest.Mocked<Partial<StageFeedbackModelAction>>;
  let mockEventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    mockEventEmitter = { emit: jest.fn() };
    // Mock the Funnel action
    funnelAction = {
      findByIdempotency: jest.fn(),
      findOwnedById: jest.fn(),
      updateFunnelName: jest.fn(),
      listForUserPaginated: jest.fn(),
      getLatestCompletedWizard: jest.fn(),
      getUploadedDocuments: jest.fn(),
      countActiveFunnelsExcluding: jest.fn(),
      deleteFunnelById: jest.fn().mockResolvedValue(true),
      getUserProfile: jest.fn().mockResolvedValue({
        business_type: 'restaurant',
        target_customer: 'office workers',
        business_name: null,
      }),
    } as unknown as jest.Mocked<FunnelModelAction>;

    // Mock the Stage action
    stageAction = {
      getStagesWithTasks: jest.fn(),
      getStagesByFunnelId: jest.fn(),
      get: jest.fn(),
    } as unknown as jest.Mocked<FunnelStageModelAction>;

    // Mock the Task action
    taskAction = {
      getStageCounts: jest.fn(),
      getTasksByStageId: jest.fn(),
      getSingleStageCount: jest.fn(),
    } as unknown as jest.Mocked<StageTaskModelAction>;

    feedbackAction = { findExistingFeedback: jest.fn(), createFeedback: jest.fn() };

    redisService = { rateLimit: jest.fn().mockResolvedValue({ count: 1, exceeded: false }) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager: {
        save: jest
          .fn()
          .mockImplementationOnce(async () => ({ id: FUNNEL_ID, status: FunnelStatus.GENERATING }))
          .mockImplementation(async (_entity, value) => value),
        create: jest.fn().mockImplementation((_entity, value) => value),
      },
    };
    dataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };

    mockLlmService.generateFunnelNameWithGemini.mockImplementation(async (desc: string) => desc);
    mockLlmService.generateFunnelNameWithGroq.mockImplementation(async (desc: string) => desc);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunnelsService,
        { provide: FunnelModelAction, useValue: funnelAction },
        { provide: FunnelStageModelAction, useValue: stageAction },
        { provide: StageTaskModelAction, useValue: taskAction },
        { provide: RedisService, useValue: redisService },
        { provide: getQueueToken(QUEUES.FUNNEL_GENERATION), useValue: queue },
        { provide: DataSource, useValue: dataSource },
        { provide: StageFeedbackModelAction, useValue: feedbackAction },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: LlmService, useValue: mockLlmService },
        { provide: LogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<FunnelsService>(FunnelsService);
  });

  // ========================================================================
  // GENERATION ENDPOINT TESTS
  // ========================================================================

  describe('AC-01: happy path returns 202 generating', () => {
    it('AC-01: POST /funnels/generate with valid wizard returns 202 + funnel_id + status=generating', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);

      const result = await service.createGeneration(USER_ID, BASE_DTO);

      expect(result.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(result.funnelId).toBe(FUNNEL_ID);
      expect(result.status).toBe(FunnelStatus.GENERATING);
    });

    it('AC-01: inserts funnel + 4 stages and dispatches the job before commit', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);

      await service.createGeneration(USER_ID, BASE_DTO);

      expect(queryRunner.manager.save).toHaveBeenCalledWith(Funnel, expect.any(Object));
      expect(queryRunner.manager.save).toHaveBeenCalledWith(FunnelStage, expect.any(Array));
      const stagesArg = (queryRunner.manager.save.mock.calls.find((c) => c[0] === FunnelStage) ?? [])[1] as Array<{
        position: number;
        name: string;
        status: string;
      }>;
      expect(stagesArg).toHaveLength(4);
      expect(stagesArg.map((s) => s.position)).toEqual([1, 2, 3, 4]);
      expect(stagesArg.map((s) => s.name)).toEqual([
        'Get Noticed',
        'Spark Interest',
        'Make First Sale',
        'Bring Them Back',
      ]);

      expect(queue.add).toHaveBeenCalledWith(
        JOBS.GENERATE_FUNNEL,
        expect.objectContaining({ funnelId: FUNNEL_ID, userId: USER_ID }),
        expect.objectContaining({ jobId: `funnel:${FUNNEL_ID}` }),
      );

      const dispatchOrder = queue.add.mock.invocationCallOrder[0];
      const commitOrder = queryRunner.commitTransaction.mock.invocationCallOrder[0];
      expect(dispatchOrder).toBeLessThan(commitOrder);
    });
  });

  describe('AC-02: idempotency returns 200 with existing funnel', () => {
    it('AC-02: same idempotency_key twice returns 200 with same funnel_id, no new insert', async () => {
      funnelAction.findByIdempotency.mockResolvedValue({
        id: FUNNEL_ID,
        status: FunnelStatus.GENERATING,
      } as Funnel);

      const result = await service.createGeneration(USER_ID, BASE_DTO);

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.funnelId).toBe(FUNNEL_ID);
      expect(queryRunner.startTransaction).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('SEC-03: rate limiting', () => {
    it('does not call rateLimit when idempotency_key already exists', async () => {
      funnelAction.findByIdempotency.mockResolvedValue({
        id: FUNNEL_ID,
        status: FunnelStatus.GENERATING,
      } as Funnel);

      await service.createGeneration(USER_ID, BASE_DTO);
      expect(redisService.rateLimit).not.toHaveBeenCalled();
    });

    it('throws 429 when rate limit is exceeded for a new generation attempt', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      redisService.rateLimit.mockResolvedValue({ count: 6, exceeded: true });

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(HttpException);
    });
  });

  describe('EC-02: concurrent generation allowed (multi-funnel)', () => {
    it('EC-02: creates a new funnel even when a generating funnel already exists for the user', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);

      const result = await service.createGeneration(USER_ID, BASE_DTO);

      expect(result.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(result.funnelId).toBe(FUNNEL_ID);
      expect(queryRunner.startTransaction).toHaveBeenCalled();
    });

  });

  describe('AC-04: wizard source requires complete session', () => {
    it('AC-04: returns 422 ONBOARDING_INCOMPLETE when wizard session is not complete', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(null);

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('AC-05: document_upload source validation', () => {
    it('AC-05: returns 422 when any upload is not ready', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getUploadedDocuments.mockResolvedValue([
        { id: 'u1', user_id: USER_ID, status: UploadDocumentStatus.READY, file_name: 'a.pdf' } as any,
        { id: 'u2', user_id: USER_ID, status: UploadDocumentStatus.PARSING, file_name: 'b.pdf' } as any,
      ]);

      await expect(
        service.createGeneration(USER_ID, {
          source: FunnelCreationPath.DOCUMENT_UPLOAD,
          idempotency_key: IDEMPOTENCY_KEY,
          upload_ids: ['u1', 'u2'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('EC-03 / SEC-04: returns 422 when any upload belongs to another user', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getUploadedDocuments.mockResolvedValue([]);

      await expect(
        service.createGeneration(USER_ID, {
          source: FunnelCreationPath.DOCUMENT_UPLOAD,
          idempotency_key: IDEMPOTENCY_KEY,
          upload_ids: ['u1'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('document_upload context derivation', () => {
    const UPLOAD_DTO = {
      source: FunnelCreationPath.DOCUMENT_UPLOAD,
      idempotency_key: IDEMPOTENCY_KEY,
      upload_ids: ['u1'],
    };

    const READY_DOC = {
      id: 'u1',
      user_id: USER_ID,
      status: UploadDocumentStatus.READY,
      file_name: 'brand-guide.pdf',
      parsed_text: 'We sell handcrafted leather goods to premium buyers',
    };

    type SavedFunnel = {
      funnel_name: string;
      business_context: { business_name: string; businessType: string; target_customer: string };
    };

    beforeEach(() => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getUploadedDocuments.mockResolvedValue([READY_DOC as any]);
    });

    it('uses parsed document text to generate funnel name via Gemini', async () => {
      mockLlmService.generateFunnelNameWithGemini.mockResolvedValueOnce('Leather Craft Co');

      await service.createGeneration(USER_ID, UPLOAD_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('Leather Craft Co');
      expect(mockLlmService.generateFunnelNameWithGemini).toHaveBeenCalledWith(
        READY_DOC.parsed_text,
        'unknown',
      );
    });

    it('falls back to Groq if Gemini fails', async () => {
      mockLlmService.generateFunnelNameWithGemini.mockRejectedValueOnce(new Error('Gemini error'));
      mockLlmService.generateFunnelNameWithGroq.mockResolvedValueOnce('Groq Leather Co');

      await service.createGeneration(USER_ID, UPLOAD_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('Groq Leather Co');
      expect(mockLlmService.generateFunnelNameWithGroq).toHaveBeenCalledWith(
        READY_DOC.parsed_text,
        'unknown',
      );
    });

    it('falls back to default funnel name if both Gemini and Groq fail', async () => {
      mockLlmService.generateFunnelNameWithGemini.mockRejectedValueOnce(new Error('Gemini error'));
      mockLlmService.generateFunnelNameWithGroq.mockRejectedValueOnce(new Error('Groq error'));

      await service.createGeneration(USER_ID, UPLOAD_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('My Funnel');
    });

    it('skips LLM and uses default funnel name when parsed text is empty', async () => {
      funnelAction.getUploadedDocuments.mockResolvedValue([
        { ...READY_DOC, parsed_text: '' } as any,
      ]);

      await service.createGeneration(USER_ID, UPLOAD_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('My Funnel');
      expect(mockLlmService.generateFunnelNameWithGemini).not.toHaveBeenCalled();
    });

    it('uses user business_name in businessContext, not the generated funnel name', async () => {
      funnelAction.getUserProfile.mockResolvedValueOnce({
        business_type: 'retail',
        target_customer: 'premium buyers',
        business_name: 'Craft House',
      });
      mockLlmService.generateFunnelNameWithGemini.mockResolvedValueOnce('Leather Craft Co');

      await service.createGeneration(USER_ID, UPLOAD_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('Leather Craft Co');
      expect(saved.business_context.business_name).toBe('Craft House');
    });

    it('falls back to funnel name in businessContext when user has no business_name', async () => {
      funnelAction.getUserProfile.mockResolvedValueOnce({
        business_type: 'retail',
        target_customer: 'premium buyers',
        business_name: null,
      });
      mockLlmService.generateFunnelNameWithGemini.mockResolvedValueOnce('Leather Craft Co');

      await service.createGeneration(USER_ID, UPLOAD_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.business_context.business_name).toBe('Leather Craft Co');
    });
  });

  describe('AC-09: rollback on queue dispatch failure', () => {
    it('AC-09: rolls back the transaction and returns 503 when queue.add throws', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);
      queue.add.mockRejectedValueOnce(new Error('Redis is down'));

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(ServiceUnavailableException);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // READ / STATUS ENDPOINT TESTS
  // ========================================================================

  describe('AC-06 / AC-07: status endpoint', () => {
    it('AC-06: returns generating without a redirect field while in flight', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.GENERATING } as Funnel);
      const result = await service.getStatus(FUNNEL_ID, USER_ID);
      expect(result.status).toBe(FunnelStatus.GENERATING);
      expect(result.redirect).toBeUndefined();
    });

    it('AC-07: returns active with redirect to strategy_dashboard once complete', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
      const result = await service.getStatus(FUNNEL_ID, USER_ID);
      expect(result.status).toBe(FunnelStatus.ACTIVE);
      expect(result.redirect).toEqual({ to: 'strategy_dashboard' });
    });

    it('returns failed status with error block when generation failed', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.FAILED } as Funnel);
      const result = await service.getStatus(FUNNEL_ID, USER_ID);
      expect(result.status).toBe(FunnelStatus.FAILED);
      expect(result.error?.code).toBe('GENERATION_FAILED');
      expect(result.error?.retry_endpoint).toBe('/api/funnels/generate');
    });
  });

  describe('AC-08: cross-user status returns 404', () => {
    it('AC-08: returns 404 (not 403) for funnels owned by a different user', async () => {
      funnelAction.findOwnedById.mockResolvedValue(null);
      await expect(service.getStatus(FUNNEL_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('AC-10: status endpoint completes under 100ms', () => {
    it('AC-10: getStatus returns in under 100ms for a populated owned funnel', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
      const start = Date.now();
      await service.getStatus(FUNNEL_ID, USER_ID);
      expect(Date.now() - start).toBeLessThan(100);
    });
  });

  describe('listForUser', () => {
    it('listForUser caps per_page at 20 and returns summaries with task counts', async () => {
      const sampleFunnel: any = {
        id: 'f1',
        funnel_name: 'B',
        creation_path: 'cp',
        status: 'active',
        created_at: new Date(),
        stages: [{ id: 's1', position: 1, name: 'S1', status: 'active' }],
      };

      funnelAction.listForUserPaginated.mockResolvedValue([[sampleFunnel], 1]);
      taskAction.getStageCounts.mockResolvedValue([{ stageId: 's1', total: 4, complete: 3 }]);

      const res = await service.listForUser('user-1', 1, 100);

      expect(res.funnels.length).toBe(1);
      expect(res.funnels[0]).toMatchObject({
        funnelId: 'f1',
        funnelName: 'B',
        creationPath: 'cp',
        status: 'active',
      });
      expect(res.pagination.perPage).toBe(20);
      expect(res.pagination.hasNext).toBe(false);
      expect(res.funnels[0].stages[0]).toEqual({
        position: 1,
        name: 'S1',
        status: 'active',
        tasksTotal: 4,
        tasksComplete: 3,
      });
      expect(taskAction.getStageCounts).toHaveBeenCalledWith(['s1']);
    });

    it('listForUser returns tasksTotal=0 and tasksComplete=0 for stages with no tasks', async () => {
      const sampleFunnel: any = {
        id: 'f2',
        business_name: 'C',
        creation_path: 'wizard',
        status: 'generating',
        created_at: new Date(),
        stages: [{ id: 's2', position: 1, name: 'S1', status: 'active' }],
      };

      funnelAction.listForUserPaginated.mockResolvedValue([[sampleFunnel], 1]);
      // getStageCounts returns no row for s2 (stage has no tasks yet)
      taskAction.getStageCounts.mockResolvedValue([]);

      const res = await service.listForUser('user-1', 1, 20);

      expect(res.funnels[0].stages[0].tasksTotal).toBe(0);
      expect(res.funnels[0].stages[0].tasksComplete).toBe(0);
    });

    it('listForUser batches all stage IDs across multiple funnels in a single getStageCounts call', async () => {
      const funnelA: any = {
        id: 'fA',
        business_name: 'A',
        creation_path: 'wizard',
        status: 'active',
        created_at: new Date(),
        stages: [
          { id: 'sA1', position: 1, name: 'S1', status: 'complete' },
          { id: 'sA2', position: 2, name: 'S2', status: 'active' },
        ],
      };
      const funnelB: any = {
        id: 'fB',
        business_name: 'B',
        creation_path: 'wizard',
        status: 'active',
        created_at: new Date(),
        stages: [{ id: 'sB1', position: 1, name: 'S1', status: 'active' }],
      };

      funnelAction.listForUserPaginated.mockResolvedValue([[funnelA, funnelB], 2]);
      taskAction.getStageCounts.mockResolvedValue([
        { stageId: 'sA1', total: 3, complete: 3 },
        { stageId: 'sA2', total: 5, complete: 1 },
        { stageId: 'sB1', total: 2, complete: 0 },
      ]);

      const res = await service.listForUser('user-1', 1, 20);

      expect(taskAction.getStageCounts).toHaveBeenCalledTimes(1);
      expect(taskAction.getStageCounts).toHaveBeenCalledWith(['sA1', 'sA2', 'sB1']);
      expect(res.funnels[0].stages[0]).toMatchObject({ tasksTotal: 3, tasksComplete: 3 });
      expect(res.funnels[0].stages[1]).toMatchObject({ tasksTotal: 5, tasksComplete: 1 });
      expect(res.funnels[1].stages[0]).toMatchObject({ tasksTotal: 2, tasksComplete: 0 });
    });
  });

  describe('getFullFunnel', () => {
    it('getFullFunnel throws NotFound when funnel missing', async () => {
      funnelAction.findOwnedById.mockResolvedValue(null);
      await expect(service.getFullFunnel('u1', 'f1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('EC-01 - getFullFunnel queries correctly', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: 'f1', user_id: 'u1' } as any);

      stageAction.getStagesWithTasks.mockResolvedValue([
        {
          id: 's1',
          position: 1,
          name: 'S1',
          channel: 'email',
          status: 'active',
          tasks: [{ id: 't1', position: 1, name: 'T1', status: 'pending' }],
        } as any,
      ]);

      taskAction.getStageCounts.mockResolvedValue([{ stageId: 's1', total: 1, complete: 0 }]);

      const res = await service.getFullFunnel('u1', 'f1');
      expect(res.stages.length).toBe(1);
      expect(funnelAction.findOwnedById).toHaveBeenCalledTimes(1);
      expect(stageAction.getStagesWithTasks).toHaveBeenCalledTimes(1);
      expect(taskAction.getStageCounts).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStagesSummary', () => {
    it('getStagesSummary returns lean stage payloads', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: 'f1', user_id: 'u1' } as any);
      stageAction.getStagesByFunnelId.mockResolvedValue([
        {
          id: 's1',
          position: 1,
          name: 'S1',
          channel: 'email',
          status: 'active',
          unlocked_at: null,
          completed_at: null,
        } as any,
      ]);
      taskAction.getStageCounts.mockResolvedValue([{ stageId: 's1', total: 2, complete: 1 }]);

      const res = await service.getStagesSummary('u1', 'f1');
      expect(res).toEqual([
        {
          stageId: 's1',
          position: 1,
          name: 'S1',
          channel: 'email',
          status: 'active',
          unlockedAt: null,
          completedAt: null,
          tasksTotal: 2,
          tasksComplete: 1,
        },
      ]);
    });
  });

  describe('getStageDetail', () => {
    it('getStageDetail enforces lock and returns ForbiddenException with message', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: 'f1', user_id: 'u1' } as any);

      // first call finds the locked stage; second call finds the prior completed stage
      stageAction.get
        .mockResolvedValueOnce({ id: 's2', funnel_id: 'f1', position: 2, name: 'Stage 2', status: 'locked' } as any)
        .mockResolvedValueOnce({ id: 's1', funnel_id: 'f1', position: 1, name: 'Stage 1', status: 'complete' } as any);

      await expect(service.getStageDetail('u1', 'f1', 's2')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('getStageDetail returns a full stage payload when unlocked', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: 'f1', user_id: 'u1' } as any);

      stageAction.get.mockResolvedValueOnce({
        id: 's2',
        funnel_id: 'f1',
        position: 2,
        name: 'Stage 2',
        channel: 'email',
        status: 'active',
        explanation: 'Ex',
        action_prompt: 'Act',
        unlocked_at: new Date(),
        completed_at: null,
      } as any);

      taskAction.getTasksByStageId.mockResolvedValue([
        { id: 't1', position: 1, name: 'Task 1', status: 'complete' } as any,
      ]);
      taskAction.getSingleStageCount.mockResolvedValue({ total: 1, complete: 1 });

      const res = await service.getStageDetail('u1', 'f1', 's2');
      expect(res).toMatchObject({
        stageId: 's2',
        name: 'Stage 2',
        status: 'active',
        tasksTotal: 1,
        tasksComplete: 1,
      });
      expect(res.tasks[0]).toEqual({ id: 't1', position: 1, name: 'Task 1', status: 'complete' });
    });
  });

  describe('submitFeedback', () => {
    it('returns 201 when valid feedback is submitted', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID } as Partial<Funnel> as Funnel);
      stageAction.get.mockResolvedValue({
        id: 'stage-1',
        funnel_id: FUNNEL_ID,
        status: 'complete',
      } as Partial<FunnelStage> as FunnelStage);
      (feedbackAction.findExistingFeedback as jest.Mock).mockResolvedValue(null);
      (feedbackAction.createFeedback as jest.Mock).mockResolvedValue({
        id: 'fb-1',
        stage_id: 'stage-1',
        comment: 'Great stage',
        created_at: new Date('2026-05-26T10:00:00Z'),
      } as Partial<StageFeedback> as StageFeedback);

      const result = await service.submitFeedback(USER_ID, FUNNEL_ID, 'stage-1', { comment: 'Great stage' });

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data.comment).toBe('Great stage');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.FEEDBACK_SUBMITTED,
        expect.objectContaining({ userId: USER_ID, funnelId: FUNNEL_ID, stageId: 'stage-1', feedbackId: 'fb-1' }),
      );
    });

    it('returns 409 if feedback already submitted', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID } as Partial<Funnel> as Funnel);
      stageAction.get.mockResolvedValue({
        id: 'stage-1',
        funnel_id: FUNNEL_ID,
        status: 'complete',
      } as Partial<FunnelStage> as FunnelStage);
      (feedbackAction.findExistingFeedback as jest.Mock).mockResolvedValue({
        id: 'existing-fb',
      } as Partial<StageFeedback> as StageFeedback);

      await expect(service.submitFeedback(USER_ID, FUNNEL_ID, 'stage-1', { comment: 'Great' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns 422 if stage is not complete', async () => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID } as Partial<Funnel> as Funnel);
      stageAction.get.mockResolvedValue({
        id: 'stage-1',
        funnel_id: FUNNEL_ID,
        status: 'active',
      } as Partial<FunnelStage> as FunnelStage);

      await expect(service.submitFeedback(USER_ID, FUNNEL_ID, 'stage-1', { comment: 'Great' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('renameFunnel', () => {
    const createdAt = new Date('2026-05-18T12:00:00.000Z');
    const updatedAt = new Date('2026-05-26T10:00:00.000Z');

    const baseFunnel = {
      id: FUNNEL_ID,
      user_id: USER_ID,
      funnel_name: 'Old Name',
      status: FunnelStatus.ACTIVE,
      creation_path: FunnelCreationPath.WIZARD,
      created_at: createdAt,
      updated_at: createdAt,
    } as Funnel;

    it('AC-01: updates funnel_name and returns camelCase payload', async () => {
      funnelAction.findOwnedById.mockResolvedValue(baseFunnel);
      funnelAction.updateFunnelName.mockResolvedValue({
        ...baseFunnel,
        funnel_name: 'New Name',
        updated_at: updatedAt,
      } as Funnel);

      const result = await service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'New Name' });

      expect(funnelAction.updateFunnelName).toHaveBeenCalledWith(FUNNEL_ID, USER_ID, 'New Name');
      expect(result).toEqual({
        id: FUNNEL_ID,
        funnelName: 'New Name',
        status: FunnelStatus.ACTIVE,
        creationPath: FunnelCreationPath.WIZARD,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.FUNNEL_RENAMED,
        expect.any(FunnelRenamedEvent),
      );
      const event = mockEventEmitter.emit.mock.calls[0][1] as FunnelRenamedEvent;
      expect(event.userId).toBe(USER_ID);
      expect(event.funnelId).toBe(FUNNEL_ID);
      expect(event.oldName).toBe('Old Name');
      expect(event.newName).toBe('New Name');
    });

    it('AC-08: returns 200 without DB write or event when name is unchanged', async () => {
      funnelAction.findOwnedById.mockResolvedValue(baseFunnel);

      const result = await service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'Old Name' });

      expect(result.funnelName).toBe('Old Name');
      expect(funnelAction.updateFunnelName).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('AC-06/AC-07: returns 404 when funnel is missing or owned by another user', async () => {
      funnelAction.findOwnedById.mockResolvedValue(null);

      await expect(service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'New' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.renameFunnel(OTHER_USER_ID, FUNNEL_ID, { funnelName: 'New' })).rejects.toThrow(
        NotFoundException,
      );
      expect(funnelAction.updateFunnelName).not.toHaveBeenCalled();
    });

    it('EC-01: allows rename while funnel status is generating', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        ...baseFunnel,
        status: FunnelStatus.GENERATING,
      } as Funnel);
      funnelAction.updateFunnelName.mockResolvedValue({
        ...baseFunnel,
        status: FunnelStatus.GENERATING,
        funnel_name: 'Generating Rename',
        updated_at: updatedAt,
      } as Funnel);

      const result = await service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'Generating Rename' });

      expect(result.status).toBe(FunnelStatus.GENERATING);
      expect(funnelAction.updateFunnelName).toHaveBeenCalled();
    });

    it('allows rename when funnel status is failed', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        ...baseFunnel,
        status: FunnelStatus.FAILED,
      } as Funnel);
      funnelAction.updateFunnelName.mockResolvedValue({
        ...baseFunnel,
        status: FunnelStatus.FAILED,
        funnel_name: 'Failed Rename',
        updated_at: updatedAt,
      } as Funnel);

      await service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'Failed Rename' });

      expect(funnelAction.updateFunnelName).toHaveBeenCalledWith(FUNNEL_ID, USER_ID, 'Failed Rename');
    });

    it('returns 404 when funnel is deleted between ownership check and update', async () => {
      funnelAction.findOwnedById.mockResolvedValue(baseFunnel);
      funnelAction.updateFunnelName.mockResolvedValue(null);

      await expect(service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('FR-7: emits FUNNEL_RENAMED only after update succeeds', async () => {
      const order: string[] = [];
      funnelAction.findOwnedById.mockResolvedValue(baseFunnel);
      funnelAction.updateFunnelName.mockImplementation(async () => {
        order.push('update');
        return { ...baseFunnel, funnel_name: 'After', updated_at: updatedAt } as Funnel;
      });
      mockEventEmitter.emit.mockImplementation(() => {
        order.push('emit');
      });

      await service.renameFunnel(USER_ID, FUNNEL_ID, { funnelName: 'After' });

      expect(order).toEqual(['update', 'emit']);
    });
  });

  describe('wizard context derivation', () => {
    type SavedFunnel = {
      funnel_name: string;
      business_context: { businessType: string; business_description: string; target_customer: string };
    };

    it('uses step_1.business_description to generate funnel_name', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);
      mockLlmService.generateFunnelNameWithGemini.mockResolvedValueOnce('Jollof Spot');

      await service.createGeneration(USER_ID, BASE_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('Jollof Spot');
      expect(saved.business_context.business_description).toBe('Casual jollof spot');
      expect(mockLlmService.generateFunnelNameWithGemini).toHaveBeenCalledWith('Casual jollof spot', 'Instagram');
    });

    it('falls back to Groq if Gemini funnel name generation fails', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);
      mockLlmService.generateFunnelNameWithGemini.mockRejectedValueOnce(new Error('Gemini error'));
      mockLlmService.generateFunnelNameWithGroq.mockResolvedValueOnce('Groq Jollof Spot');

      await service.createGeneration(USER_ID, BASE_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('Groq Jollof Spot');
      expect(mockLlmService.generateFunnelNameWithGroq).toHaveBeenCalledWith('Casual jollof spot', 'Instagram');
    });

    it('falls back to default funnel name if both Gemini and Groq fail', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);
      mockLlmService.generateFunnelNameWithGemini.mockRejectedValueOnce(new Error('Gemini error'));
      mockLlmService.generateFunnelNameWithGroq.mockRejectedValueOnce(new Error('Groq error'));

      await service.createGeneration(USER_ID, BASE_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.funnel_name).toBe('My Funnel');
    });

    it('joins multiple discovery channels into a comma-separated string for the LLM', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue({
        ...COMPLETE_WIZARD,
        answers: {
          ...COMPLETE_WIZARD.answers,
          step_3: { discovery_channel: ['Instagram', 'WhatsApp'] },
        },
      } as WizardSession);
      mockLlmService.generateFunnelNameWithGemini.mockResolvedValueOnce('Jollof Spot');

      await service.createGeneration(USER_ID, BASE_DTO);

      expect(mockLlmService.generateFunnelNameWithGemini).toHaveBeenCalledWith(
        'Casual jollof spot',
        'Instagram, WhatsApp',
      );
    });

    it('uses user profile fields for businessType and target_customer', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);
      funnelAction.getUserProfile.mockResolvedValue({
        business_type: 'restaurant',
        target_customer: 'office workers',
        business_name: null,
      });

      await service.createGeneration(USER_ID, BASE_DTO);

      const saved = queryRunner.manager.save.mock.calls[0][1] as SavedFunnel;
      expect(saved.business_context.businessType).toBe('restaurant');
      expect(saved.business_context.target_customer).toBe('office workers');
    });
  });

  describe('deleteFunnel', () => {
    const activeFunnel = {
      id: FUNNEL_ID,
      user_id: USER_ID,
      status: FunnelStatus.ACTIVE,
      funnel_name: 'Acme Studio',
    } as Funnel;

    it('AC-01: deletes owned active funnel when another active funnel remains', async () => {
      funnelAction.findOwnedById.mockResolvedValue(activeFunnel);
      funnelAction.countActiveFunnelsExcluding.mockResolvedValue(1);

      const result = await service.deleteFunnel(USER_ID, FUNNEL_ID);

      expect(result).toEqual({ statusCode: HttpStatus.OK, message: SYS_MSG.FUNNEL_DELETED });
      expect(funnelAction.countActiveFunnelsExcluding).toHaveBeenCalledWith(USER_ID, FUNNEL_ID, expect.anything());
      expect(funnelAction.deleteFunnelById).toHaveBeenCalledWith(FUNNEL_ID, USER_ID, expect.anything());
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.FUNNEL_DELETED,
        expect.any(FunnelDeletedEvent),
      );
      const event = mockEventEmitter.emit.mock.calls[0][1] as FunnelDeletedEvent;
      expect(event.userId).toBe(USER_ID);
      expect(event.funnelId).toBe(FUNNEL_ID);
      expect(event.funnelName).toBe('Acme Studio');
    });

    it('AC-04: rejects deleting the only active funnel with 409 message', async () => {
      funnelAction.findOwnedById.mockResolvedValue(activeFunnel);
      funnelAction.countActiveFunnelsExcluding.mockResolvedValue(0);

      await expect(service.deleteFunnel(USER_ID, FUNNEL_ID)).rejects.toThrow(ConflictException);
      expect(funnelAction.deleteFunnelById).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('AC-05: deletes failed funnel without active-funnel guard', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        ...activeFunnel,
        status: FunnelStatus.FAILED,
      } as Funnel);

      await service.deleteFunnel(USER_ID, FUNNEL_ID);

      expect(funnelAction.countActiveFunnelsExcluding).not.toHaveBeenCalled();
      expect(funnelAction.deleteFunnelById).toHaveBeenCalledWith(FUNNEL_ID, USER_ID, expect.anything());
    });

    it('AC-06: deletes generating funnel without active-funnel guard', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        ...activeFunnel,
        status: FunnelStatus.GENERATING,
      } as Funnel);

      await service.deleteFunnel(USER_ID, FUNNEL_ID);

      expect(funnelAction.countActiveFunnelsExcluding).not.toHaveBeenCalled();
      expect(funnelAction.deleteFunnelById).toHaveBeenCalledWith(FUNNEL_ID, USER_ID, expect.anything());
    });

    it('returns 404 when funnel is deleted between ownership check and delete', async () => {
      funnelAction.findOwnedById.mockResolvedValue(activeFunnel);
      funnelAction.countActiveFunnelsExcluding.mockResolvedValue(1);
      funnelAction.deleteFunnelById.mockResolvedValue(false);

      await expect(service.deleteFunnel(USER_ID, FUNNEL_ID)).rejects.toThrow(NotFoundException);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('AC-07/AC-08: returns 404 when funnel is missing or not owned', async () => {
      funnelAction.findOwnedById.mockResolvedValue(null);

      await expect(service.deleteFunnel(USER_ID, FUNNEL_ID)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteFunnel(OTHER_USER_ID, FUNNEL_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('FR-7/EC-04: emits only after hard delete and transaction commit succeed', async () => {
      const order: string[] = [];
      funnelAction.findOwnedById.mockResolvedValue(activeFunnel);
      funnelAction.countActiveFunnelsExcluding.mockResolvedValue(1);
      funnelAction.deleteFunnelById.mockImplementation(async () => {
        order.push('delete');
        return true;
      });
      queryRunner.commitTransaction.mockImplementation(async () => {
        order.push('commit');
      });
      mockEventEmitter.emit.mockImplementation(() => {
        order.push('emit');
      });

      await service.deleteFunnel(USER_ID, FUNNEL_ID);

      expect(order).toEqual(['delete', 'commit', 'emit']);
    });
  });
});
