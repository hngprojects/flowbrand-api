import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FunnelModelAction } from '../../actions/funnel.action';
import { FunnelStageModelAction } from '../../actions/funnel-stage.action';
import { StageTaskModelAction } from '../../actions/stage-task.action';
import { FunnelStage } from '../../entities/funnel-stage.entity';
import { StageTask } from '../../entities/stage-task.entity';
import { StageStatus } from '../../enums/stage-status.enum';
import { StageProgressService } from '../stage-progress.service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const FUNNEL_ID = '22222222-2222-4222-8222-222222222222';
const STAGE_ID = '33333333-3333-4333-8333-333333333333';
const NEXT_STAGE_ID = '44444444-4444-4444-8444-444444444444';
const TASK_ID = '55555555-5555-4555-8555-555555555555';

const mockFunnelAction = { findOwnedById: jest.fn() };
const mockStageAction = { findOwnedStage: jest.fn(), completeAndUnlockNext: jest.fn() };
const mockTaskAction = { findOwnedTask: jest.fn(), saveTask: jest.fn(), countByStage: jest.fn() };

function makeStage(overrides: Partial<FunnelStage> = {}): FunnelStage {
  return {
    id: STAGE_ID,
    funnel_id: FUNNEL_ID,
    position: 1,
    name: 'Get Noticed',
    status: StageStatus.ACTIVE,
    unlocked_at: new Date(),
    completed_at: null,
    ...overrides,
  } as FunnelStage;
}

function makeTask(overrides: Partial<StageTask> = {}): StageTask {
  return {
    id: TASK_ID,
    stage_id: STAGE_ID,
    status: 'pending',
    is_complete: false,
    completed_at: null,
    position: 1,
    name: 'Define ICP',
    ...overrides,
  } as StageTask;
}

describe('StageProgressService', () => {
  let module: TestingModule;
  let service: StageProgressService;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        StageProgressService,
        { provide: FunnelModelAction, useValue: mockFunnelAction },
        { provide: FunnelStageModelAction, useValue: mockStageAction },
        { provide: StageTaskModelAction, useValue: mockTaskAction },
      ],
    }).compile();
    service = module.get<StageProgressService>(StageProgressService);
    mockFunnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, user_id: USER_ID });
  });

  afterEach(async () => {
    await module.close();
  });

  describe('completeTask', () => {
    it('marks a task complete on an active stage', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage());
      mockTaskAction.findOwnedTask.mockResolvedValue(makeTask());
      const completedAt = new Date();
      mockTaskAction.saveTask.mockImplementation((t: StageTask) =>
        Promise.resolve({ ...t, is_complete: true, completed_at: completedAt }),
      );

      const result = await service.completeTask(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete');

      expect(mockTaskAction.saveTask).toHaveBeenCalledWith(
        expect.objectContaining({ id: TASK_ID, status: 'complete' }),
      );
      expect(result).toEqual({
        taskId: TASK_ID,
        stageId: STAGE_ID,
        status: 'complete',
        completedAt,
      });
    });

    it('throws 404 when the funnel is not owned by the user', async () => {
      mockFunnelAction.findOwnedById.mockResolvedValue(null);

      await expect(
        service.completeTask(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 422 when the stage is not active', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage({ status: StageStatus.LOCKED }));

      await expect(
        service.completeTask(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mockTaskAction.saveTask).not.toHaveBeenCalled();
    });

    it('throws 404 when the task does not belong to the stage', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage());
      mockTaskAction.findOwnedTask.mockResolvedValue(null);

      await expect(
        service.completeTask(USER_ID, FUNNEL_ID, STAGE_ID, TASK_ID, 'complete'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('completeStage', () => {
    it('completes an active stage with all tasks done and unlocks the next stage', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage());
      mockTaskAction.countByStage.mockResolvedValue({ total: 3, complete: 3 });
      const completedAt = new Date();
      const unlockedAt = new Date();
      mockStageAction.completeAndUnlockNext.mockResolvedValue({
        completedStage: makeStage({ status: StageStatus.COMPLETE, completed_at: completedAt }),
        unlockedStage: makeStage({
          id: NEXT_STAGE_ID,
          position: 2,
          name: 'Spark Interest',
          status: StageStatus.ACTIVE,
          unlocked_at: unlockedAt,
        }),
      });

      const result = await service.completeStage(USER_ID, FUNNEL_ID, STAGE_ID);

      expect(mockStageAction.completeAndUnlockNext).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(StageStatus.COMPLETE);
      expect(result.nextStage).toEqual({
        stageId: NEXT_STAGE_ID,
        position: 2,
        name: 'Spark Interest',
        status: StageStatus.ACTIVE,
        unlockedAt,
      });
    });

    it('returns nextStage null when completing the final stage', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage({ position: 4 }));
      mockTaskAction.countByStage.mockResolvedValue({ total: 2, complete: 2 });
      mockStageAction.completeAndUnlockNext.mockResolvedValue({
        completedStage: makeStage({ position: 4, status: StageStatus.COMPLETE, completed_at: new Date() }),
        unlockedStage: null,
      });

      const result = await service.completeStage(USER_ID, FUNNEL_ID, STAGE_ID);

      expect(result.nextStage).toBeNull();
    });

    it('throws 422 when not all tasks are complete', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage());
      mockTaskAction.countByStage.mockResolvedValue({ total: 3, complete: 2 });

      await expect(service.completeStage(USER_ID, FUNNEL_ID, STAGE_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(mockStageAction.completeAndUnlockNext).not.toHaveBeenCalled();
    });

    it('throws 409 when the stage is already complete', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage({ status: StageStatus.COMPLETE }));

      await expect(service.completeStage(USER_ID, FUNNEL_ID, STAGE_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws 422 when the stage is locked', async () => {
      mockStageAction.findOwnedStage.mockResolvedValue(makeStage({ status: StageStatus.LOCKED }));

      await expect(service.completeStage(USER_ID, FUNNEL_ID, STAGE_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});
