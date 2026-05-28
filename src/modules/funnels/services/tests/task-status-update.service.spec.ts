import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QUEUES } from '../../../../common/constants/queue.constants';
import * as SYS_MSG from '../../../../constants/system.messages';
import { WizardSession } from '../../../onboarding/entities/wizzard-session.entity';
import { RedisService } from '../../../redis/redis.service';
import { UploadedDocument } from '../../../upload/entities/uploaded-document.entity';
import { FunnelModelAction } from '../../actions/funnel.action';
import { FunnelStageModelAction } from '../../actions/funnel-stage.action';
import { StageTaskModelAction } from '../../actions/stage-task.action';
import { StageFeedbackModelAction } from '../../actions/stage-feedback.action';
import { Funnel } from '../../entities/funnel.entity';
import { FunnelStage } from '../../entities/funnel-stage.entity';
import { StageTask } from '../../entities/stage-task.entity';
import { StageFeedback } from '../../entities/stage-feedback.entity';
import { StageStatus } from '../../enums/stage-status.enum';
import { FunnelsService } from '../funnels.service';
import { UpdateTaskStatusDto } from '../../dto/update-task-status.dto';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const FUNNEL_ID = '11111111-1111-4111-8111-111111111111';
const STAGE_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const PRIOR_STAGE_ID = '44444444-4444-4444-8444-444444444444';

const buildFunnel = (overrides: Partial<Funnel> = {}): Funnel => ({ id: FUNNEL_ID, user_id: USER_ID, ...overrides }) as Funnel;
const buildStage = (overrides: Partial<FunnelStage> = {}): FunnelStage =>
  ({ id: STAGE_ID, funnel_id: FUNNEL_ID, position: 2, name: 'Spark Interest', status: StageStatus.ACTIVE, ...overrides }) as FunnelStage;
const buildTask = (overrides: Partial<StageTask> = {}): StageTask =>
  ({
    id: TASK_ID,
    stage_id: STAGE_ID,
    name: 'Define ICP',
    status: 'pending',
    is_complete: false,
    completed_at: null,
    position: 1,
    ...overrides,
  }) as StageTask;

describe('FunnelsService - task status update', () => {
  let service: FunnelsService;
  let funnelAction: jest.Mocked<FunnelModelAction>;
  let stageAction: jest.Mocked<FunnelStageModelAction>;
  let taskAction: jest.Mocked<StageTaskModelAction>;

  beforeEach(async () => {
    funnelAction = { findOwnedById: jest.fn() } as unknown as jest.Mocked<FunnelModelAction>;
    stageAction = { get: jest.fn() } as unknown as jest.Mocked<FunnelStageModelAction>;
    taskAction = {
      findOwnedTask: jest.fn(),
      saveTask: jest.fn(),
    } as unknown as jest.Mocked<StageTaskModelAction>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunnelsService,
        { provide: FunnelModelAction, useValue: funnelAction },
        { provide: FunnelStageModelAction, useValue: stageAction },
        { provide: StageTaskModelAction, useValue: taskAction },
        { provide: StageFeedbackModelAction, useValue: {} },
        { provide: RedisService, useValue: { rateLimit: jest.fn() } },
        { provide: getQueueToken(QUEUES.FUNNEL_GENERATION), useValue: { add: jest.fn() } },
        { provide: DataSource, useValue: {} },
        { provide: getRepositoryToken(Funnel), useValue: {} },
        { provide: getRepositoryToken(FunnelStage), useValue: {} },
        { provide: getRepositoryToken(StageTask), useValue: {} },
        { provide: getRepositoryToken(WizardSession), useValue: {} },
        { provide: getRepositoryToken(UploadedDocument), useValue: {} },
        { provide: getRepositoryToken(StageFeedback), useValue: {} },
      ],
    }).compile();

    service = module.get(FunnelsService);
  });

  it('AC-01: marks pending task complete; saved entity drives the response with derived fields', async () => {
    const completedAt = new Date('2026-05-26T10:00:00.000Z');
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get.mockResolvedValue(buildStage());
    taskAction.findOwnedTask.mockResolvedValue(buildTask());
    taskAction.saveTask.mockResolvedValue(buildTask({ status: 'complete', is_complete: true, completed_at: completedAt }));

    const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete');

    expect(taskAction.saveTask).toHaveBeenCalledWith(expect.objectContaining({ id: TASK_ID, status: 'complete' }));
    expect(result).toEqual({
      taskId: TASK_ID,
      name: 'Define ICP',
      status: 'complete',
      isComplete: true,
      completedAt: completedAt.toISOString(),
      position: 1,
    });
  });

  it('AC-02: reopens a complete task to pending; clears completed_at via the saved entity', async () => {
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get.mockResolvedValue(buildStage());
    taskAction.findOwnedTask.mockResolvedValue(
      buildTask({ status: 'complete', is_complete: true, completed_at: new Date('2026-05-26T10:00:00.000Z') }),
    );
    taskAction.saveTask.mockResolvedValue(buildTask({ status: 'pending', is_complete: false, completed_at: null }));

    const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'pending');

    expect(taskAction.saveTask).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(result.status).toBe('pending');
    expect(result.isComplete).toBe(false);
    expect(result.completedAt).toBeNull();
  });

  it('AC-03: task does not belong to the stage returns 404 without writing', async () => {
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get.mockResolvedValue(buildStage());
    taskAction.findOwnedTask.mockResolvedValue(null);

    await expect(service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete')).rejects.toThrow(
      new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND),
    );
    expect(taskAction.saveTask).not.toHaveBeenCalled();
  });

  it('AC-04: stage does not belong to the funnel returns 404 without leaking which step failed', async () => {
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get.mockResolvedValue(null);

    await expect(service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete')).rejects.toThrow(
      new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND),
    );
    expect(taskAction.findOwnedTask).not.toHaveBeenCalled();
  });

  it('AC-05: funnel belongs to a different user returns 404 with the unified message', async () => {
    funnelAction.findOwnedById.mockResolvedValue(null);

    await expect(service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete')).rejects.toThrow(
      new NotFoundException(SYS_MSG.FUNNEL_TASK_NOT_FOUND),
    );
    expect(stageAction.get).not.toHaveBeenCalled();
    expect(taskAction.findOwnedTask).not.toHaveBeenCalled();
  });

  it('AC-06: parent stage locked returns 403 with the lock message referencing the prior stage', async () => {
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    const lockedStage = buildStage({ status: StageStatus.LOCKED, position: 2, name: 'Spark Interest' });
    const priorStage = buildStage({ id: PRIOR_STAGE_ID, position: 1, name: 'Get Noticed', status: StageStatus.COMPLETE });
    stageAction.get.mockResolvedValueOnce(lockedStage).mockResolvedValueOnce(priorStage);

    await expect(service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete')).rejects.toThrow(
      new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE('Spark Interest', 'Get Noticed')),
    );
    expect(taskAction.findOwnedTask).not.toHaveBeenCalled();
    expect(taskAction.saveTask).not.toHaveBeenCalled();
  });

  it('AC-06 fallback: locked stage with no resolvable prior still 403 using the "previous" placeholder', async () => {
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get
      .mockResolvedValueOnce(buildStage({ status: StageStatus.LOCKED, position: 1, name: 'Get Noticed' }))
      .mockResolvedValueOnce(null);

    await expect(service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete')).rejects.toThrow(
      new ForbiddenException(SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE('Get Noticed', 'previous')),
    );
  });

  it('AC-07: missing status field fails DTO validation before the service is called', async () => {
    const dto = plainToInstance(UpdateTaskStatusDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isIn).toBeDefined();
  });

  it('AC-08: invalid status string fails DTO validation', async () => {
    const dto = plainToInstance(UpdateTaskStatusDto, { status: 'done' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isIn).toBeDefined();
  });

  it('AC-09: marking already-complete task complete is idempotent, returns current state without saving', async () => {
    const completedAt = new Date('2026-05-26T10:00:00.000Z');
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get.mockResolvedValue(buildStage());
    taskAction.findOwnedTask.mockResolvedValue(
      buildTask({ status: 'complete', is_complete: true, completed_at: completedAt }),
    );

    const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete');

    expect(taskAction.saveTask).not.toHaveBeenCalled();
    expect(result).toEqual({
      taskId: TASK_ID,
      name: 'Define ICP',
      status: 'complete',
      isComplete: true,
      completedAt: completedAt.toISOString(),
      position: 1,
    });
  });

  it('AC-09 mirror: marking already-pending task pending is idempotent', async () => {
    funnelAction.findOwnedById.mockResolvedValue(buildFunnel());
    stageAction.get.mockResolvedValue(buildStage());
    taskAction.findOwnedTask.mockResolvedValue(buildTask());

    const result = await service.updateTaskStatus(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'pending');

    expect(taskAction.saveTask).not.toHaveBeenCalled();
    expect(result.status).toBe('pending');
    expect(result.completedAt).toBeNull();
  });
});
