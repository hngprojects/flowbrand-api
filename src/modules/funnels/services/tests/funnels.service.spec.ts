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
import { DataSource } from 'typeorm';
import { JOBS, QUEUES } from '../../../../common/constants/queue.constants';
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
import { FunnelsService } from '.././funnels.service';
import { Logger } from '@nestjs/common';
import { StageFeedbackModelAction } from '../../actions/stage-feedback.action';
import { StageFeedback } from '../../entities/stage-feedback.entity';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';
const FUNNEL_ID = '22222222-2222-4222-8222-222222222222';
const STAGE_ID = '33333333-3333-4333-8333-333333333333';
const TASK_ID = '44444444-4444-4444-8444-444444444444';

const BASE_DTO = {
  source: FunnelCreationPath.WIZARD,
  idempotency_key: IDEMPOTENCY_KEY,
};

const COMPLETE_WIZARD: Partial<WizardSession> = {
  id: 'wsess-1',
  user_id: USER_ID,
  status: WizardStatus.COMPLETE,
  answers: {
    business_name: 'Mama Adunni Kitchen',
    business_type: 'restaurant',
    discovery_channel: 'Instagram',
    business_description: 'Casual jollof spot',
    target_customer: 'office workers',
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
    manager: { save: jest.Mock; create: jest.Mock };
  };
  let dataSource: { createQueryRunner: jest.Mock };
  let feedbackAction: jest.Mocked<Partial<StageFeedbackModelAction>>;

  beforeEach(async () => {
    // Mock the Funnel action
    funnelAction = {
      findByIdempotency: jest.fn(),
      findGeneratingForUser: jest.fn(),
      findOwnedById: jest.fn(),
      listForUserPaginated: jest.fn(),
      getLatestCompletedWizard: jest.fn(),
      getUploadedDocuments: jest.fn(),
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
      get: jest.fn(),
      save: jest.fn(),
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
      manager: {
        save: jest
          .fn()
          .mockImplementationOnce(async () => ({ id: FUNNEL_ID, status: FunnelStatus.GENERATING }))
          .mockImplementation(async (_entity, value) => value),
        create: jest.fn().mockImplementation((_entity, value) => value),
      },
    };
    dataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };

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
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(COMPLETE_WIZARD as WizardSession);

      const result = await service.createGeneration(USER_ID, BASE_DTO);

      expect(result.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(result.funnelId).toBe(FUNNEL_ID);
      expect(result.status).toBe(FunnelStatus.GENERATING);
    });

    it('AC-01: inserts funnel + 4 stages and dispatches the job before commit', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
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

  describe('AC-03: concurrent generation guard', () => {
    it('AC-03: returns 409 GENERATION_IN_PROGRESS when another funnel is generating', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue({
        id: 'other-fid',
        status: FunnelStatus.GENERATING,
      } as Funnel);

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(ConflictException);
    });
  });

  describe('AC-04: wizard source requires complete session', () => {
    it('AC-04: returns 422 ONBOARDING_INCOMPLETE when wizard session is not complete', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
      funnelAction.getLatestCompletedWizard.mockResolvedValue(null);

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('AC-05: document_upload source validation', () => {
    it('AC-05: returns 422 when any upload is not ready', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
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
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
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

  describe('AC-09: rollback on queue dispatch failure', () => {
    it('AC-09: rolls back the transaction and returns 503 when queue.add throws', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
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
    it('listForUser caps per_page at 20 and returns summaries', async () => {
      const sampleFunnel: any = {
        id: 'f1',
        business_name: 'B',
        creation_path: 'cp',
        status: 'active',
        created_at: new Date(),
        stages: [{ position: 1, name: 'S1', status: 'active' }],
      };

      funnelAction.listForUserPaginated.mockResolvedValue([[sampleFunnel], 1]);

      const res = await service.listForUser('user-1', 1, 100);
      expect(res.funnels.length).toBe(1);
      expect(res.funnels[0]).toMatchObject({
        funnelId: 'f1',
        businessName: 'B',
        creationPath: 'cp',
        status: 'active',
      });
      expect(res.pagination.perPage).toBe(20);
      expect(res.pagination.hasNext).toBe(false);
      expect(res.funnels[0].stages[0]).toEqual({ position: 1, name: 'S1', status: 'active' });
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

  describe('updateTaskStatus', () => {
    const ACTIVE_STAGE = { id: STAGE_ID, funnel_id: FUNNEL_ID, status: 'active' } as any;
    const PENDING_TASK = {
      id: TASK_ID,
      stage_id: STAGE_ID,
      name: 'Create lead magnet',
      position: 1,
      status: 'pending',
      is_complete: false,
      completed_at: null,
    } as any;
    const COMPLETE_TASK = {
      id: TASK_ID,
      stage_id: STAGE_ID,
      name: 'Create lead magnet',
      position: 1,
      status: 'complete',
      is_complete: true,
      completed_at: new Date('2026-05-26T10:00:00Z'),
    } as any;

    beforeEach(() => {
      funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID } as Partial<Funnel> as Funnel);
      stageAction.get.mockResolvedValue(ACTIVE_STAGE);
      redisService.rateLimit.mockResolvedValue({ count: 1, exceeded: false });
    });

    it('AC-01: marking pending→complete returns 200 with isComplete=true and completedAt set', async () => {
      (taskAction.get as jest.Mock).mockResolvedValue({ ...PENDING_TASK });
      (taskAction.save as jest.Mock).mockResolvedValue({ ...COMPLETE_TASK });

      const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.status).toBe('complete');
      expect(result.data.isComplete).toBe(true);
      expect(result.data.completedAt).toBe('2026-05-26T10:00:00.000Z');
    });

    it('AC-02: marking complete→pending returns 200 with isComplete=false and completedAt=null', async () => {
      (taskAction.get as jest.Mock).mockResolvedValue({ ...COMPLETE_TASK });
      (taskAction.save as jest.Mock).mockResolvedValue({ ...PENDING_TASK });

      const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'pending' });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.status).toBe('pending');
      expect(result.data.isComplete).toBe(false);
      expect(result.data.completedAt).toBeNull();
    });

    it('AC-03: taskId from a different stage → 404', async () => {
      (taskAction.get as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('AC-04: stageId from a different funnel → 404', async () => {
      stageAction.get.mockResolvedValue(null);

      await expect(
        service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('AC-05: funnelId owned by a different user → 404', async () => {
      funnelAction.findOwnedById.mockResolvedValue(null);

      await expect(
        service.updateTaskStatus(OTHER_USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('AC-06: parent stage is locked → 403 ForbiddenException', async () => {
      stageAction.get.mockResolvedValue({ id: STAGE_ID, funnel_id: FUNNEL_ID, status: 'locked' } as any);

      await expect(
        service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('AC-09: completing an already-complete task is idempotent → 200, no DB write', async () => {
      (taskAction.get as jest.Mock).mockResolvedValue({ ...COMPLETE_TASK });

      const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.isComplete).toBe(true);
      expect(result.data.completedAt).toBe('2026-05-26T10:00:00.000Z');
      expect(taskAction.save).not.toHaveBeenCalled();
    });

    it('SEC-04a: rate limit exceeded → 429 HttpException', async () => {
      redisService.rateLimit.mockResolvedValue({ count: 31, exceeded: true });

      await expect(
        service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' }),
      ).rejects.toThrow(HttpException);
    });

    it('SEC-04b: rate limit check fires before any DB lookup', async () => {
      redisService.rateLimit.mockResolvedValue({ count: 31, exceeded: true });

      await expect(
        service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' }),
      ).rejects.toThrow(HttpException);

      expect(funnelAction.findOwnedById).not.toHaveBeenCalled();
    });

    it('sets task.status from dto before calling save', async () => {
      (taskAction.get as jest.Mock).mockResolvedValue({ ...PENDING_TASK });
      (taskAction.save as jest.Mock).mockImplementation(async ({ entity }) => ({
        ...entity,
        is_complete: true,
        completed_at: new Date(),
      }));

      await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, { status: 'complete' });

      const savedArg = (taskAction.save as jest.Mock).mock.calls[0][0];
      expect(savedArg.entity.status).toBe('complete');
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
});
