import { ForbiddenException, HttpStatus, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { QUEUES } from '../../../../common/constants/queue.constants';
import * as SYS_MSG from '../../../../constants/system.messages';
import { WizardSession } from '../../../onboarding/entities/wizzard-session.entity';
import { RedisService } from '../../../redis/redis.service';
import { UploadedDocument } from '../../../upload/entities/uploaded-document.entity';
import { FunnelModelAction } from '../../actions/funnel.action';
import { Funnel } from '../../entities/funnel.entity';
import { FunnelStage } from '../../entities/funnel-stage.entity';
import { FunnelStatus } from '../../enums/funnel-status.enum';
import { StageStatus } from '../../enums/stage-status.enum';
import { FunnelsService } from '../funnels.service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';
const FUNNEL_ID = '11111111-1111-4111-8111-111111111111';
const STAGE_ID = '22222222-2222-4222-8222-222222222222';
const NEXT_STAGE_ID = '33333333-3333-4333-8333-333333333333';
const PREV_STAGE_ID = '44444444-4444-4444-8444-444444444444';

function createQueryBuilderMock(total: number, pending: number) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ total, pending }),
  };
}

describe('FunnelsService - stage completion', () => {
  let service: FunnelsService;
  let funnelAction: jest.Mocked<FunnelModelAction>;
  let stageRepo: { findOne: jest.Mock };
  let queryRunner: {
    isTransactionActive: boolean;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      createQueryBuilder: jest.Mock;
      update: jest.Mock;
      findOne: jest.Mock;
    };
  };
  let dataSource: { createQueryRunner: jest.Mock; getRepository: jest.Mock };

  beforeEach(async () => {
    funnelAction = {
      findByIdempotency: jest.fn(),
      findGeneratingForUser: jest.fn(),
      findOwnedById: jest.fn(),
      countTasksForStage: jest.fn(),
      updateStageStatusIfActive: jest.fn(),
      findStageById: jest.fn(),
      findNextStage: jest.fn(),
    } as unknown as jest.Mocked<FunnelModelAction>;

    stageRepo = {
      findOne: jest.fn(),
    };

    queryRunner = {
      isTransactionActive: true,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        createQueryBuilder: jest.fn(),
        update: jest.fn(),
        findOne: jest.fn(),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      getRepository: jest.fn().mockReturnValue(stageRepo),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunnelsService,
        { provide: FunnelModelAction, useValue: funnelAction },
        { provide: RedisService, useValue: { rateLimit: jest.fn() } },
        { provide: getRepositoryToken(WizardSession), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(UploadedDocument), useValue: { find: jest.fn() } },
        { provide: getQueueToken(QUEUES.FUNNEL_GENERATION), useValue: { add: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(FunnelsService);
  });

  it('AC-01: completes an active stage and unlocks the next stage atomically', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne
      .mockResolvedValueOnce({
        id: STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 1,
        name: 'Get Noticed',
        status: StageStatus.ACTIVE,
        completed_at: null,
        unlocked_at: new Date('2026-05-26T09:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: NEXT_STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 2,
        name: 'Spark Interest',
        status: StageStatus.ACTIVE,
        completed_at: null,
        unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
      });
    funnelAction.countTasksForStage.mockResolvedValue({ total: 3, pending: 0 });
    funnelAction.updateStageStatusIfActive.mockResolvedValue(1);
    funnelAction.findNextStage.mockResolvedValue({
      id: NEXT_STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 2,
      name: 'Spark Interest',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
    } as FunnelStage);
    queryRunner.manager.update.mockResolvedValue({ affected: 1 });

    const result = await service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.message).toBe(SYS_MSG.STAGE_COMPLETED_SUCCESSFULLY);
    expect(result.data.completedStage).toMatchObject({
      stageId: STAGE_ID,
      position: 1,
      name: 'Get Noticed',
      status: StageStatus.COMPLETE,
    });
    expect(result.data.unlockedStage).toMatchObject({
      stageId: NEXT_STAGE_ID,
      position: 2,
      name: 'Spark Interest',
      status: StageStatus.ACTIVE,
    });
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('AC-02: completes the last stage and returns unlockedStage null', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne.mockResolvedValueOnce({
      id: STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 4,
      name: 'Bring Them Back',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
    });
    funnelAction.countTasksForStage.mockResolvedValue({ total: 2, pending: 0 });
    funnelAction.updateStageStatusIfActive.mockResolvedValue(1);
    funnelAction.findNextStage.mockResolvedValue(null);

    const result = await service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID);

    expect(result.data.unlockedStage).toBeNull();
    expect(result.data.completedStage.status).toBe(StageStatus.COMPLETE);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('AC-03: returns 422 when at least one task is still pending', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne.mockResolvedValueOnce({
      id: STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 1,
      name: 'Get Noticed',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date(),
    });
    funnelAction.countTasksForStage.mockResolvedValue({ total: 3, pending: 2 });

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toThrow(
      SYS_MSG.STAGE_HAS_PENDING_TASKS(2),
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('AC-04: returns 422 when the stage has zero tasks', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne.mockResolvedValueOnce({
      id: STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 1,
      name: 'Get Noticed',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date(),
    });
    funnelAction.countTasksForStage.mockResolvedValue({ total: 0, pending: 0 });

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toThrow(
      SYS_MSG.STAGE_HAS_NO_TASKS,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('AC-05: returns 200 idempotently when the stage is already complete', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne
      .mockResolvedValueOnce({
        id: STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 1,
        name: 'Get Noticed',
        status: StageStatus.COMPLETE,
        completed_at: new Date('2026-05-26T10:00:00.000Z'),
        unlocked_at: new Date('2026-05-26T09:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: NEXT_STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 2,
        name: 'Spark Interest',
        status: StageStatus.ACTIVE,
        completed_at: null,
        unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
      });

    funnelAction.findNextStage.mockResolvedValue({
      id: NEXT_STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 2,
      name: 'Spark Interest',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
    } as FunnelStage);

    const result = await service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.message).toBe(SYS_MSG.STAGE_ALREADY_COMPLETE);
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('AC-06: rejects a locked stage with 403', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne
      .mockResolvedValueOnce({
        id: STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 2,
        name: 'Spark Interest',
        status: StageStatus.LOCKED,
        completed_at: null,
        unlocked_at: null,
      })
      .mockResolvedValueOnce({
        id: PREV_STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 1,
        name: 'Get Noticed',
        status: StageStatus.COMPLETE,
        completed_at: new Date(),
        unlocked_at: new Date(),
      });

      funnelAction.findNextStage.mockResolvedValue(null);

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('AC-07: rejects a funnel that is still generating with 422', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.GENERATING } as Funnel);

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toThrow(
      'Funnel must be active before a stage can be completed.',
    );
    expect(stageRepo.findOne).not.toHaveBeenCalled();
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('AC-08: hides cross-user funnels with 404', async () => {
    funnelAction.findOwnedById.mockResolvedValue(null);

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('AC-09: hides stages that belong to a different funnel with 404', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('AC-10: rolls back if the next-stage unlock write fails', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne.mockResolvedValueOnce({
      id: STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 1,
      name: 'Get Noticed',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date(),
    });
    funnelAction.countTasksForStage.mockResolvedValue({ total: 2, pending: 0 });
    funnelAction.updateStageStatusIfActive.mockResolvedValue(1);
    funnelAction.findNextStage.mockResolvedValue({
      id: NEXT_STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 2,
      name: 'Spark Interest',
      status: StageStatus.LOCKED,
      completed_at: null,
      unlocked_at: null,
    } as FunnelStage);
    queryRunner.manager.update.mockRejectedValueOnce(new Error('unlock failed'));

    await expect(service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID)).rejects.toThrow('unlock failed');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('EC-01: returns idempotently when a concurrent request already completed the stage', async () => {
    funnelAction.findOwnedById.mockResolvedValue({ id: FUNNEL_ID, status: FunnelStatus.ACTIVE } as Funnel);
    stageRepo.findOne.mockResolvedValueOnce({
      id: STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 1,
      name: 'Get Noticed',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date(),
    });
    funnelAction.countTasksForStage.mockResolvedValue({ total: 2, pending: 0 });
    funnelAction.updateStageStatusIfActive.mockResolvedValue(0);
    funnelAction.findStageById
      .mockResolvedValueOnce({
        id: STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 1,
        name: 'Get Noticed',
        status: StageStatus.COMPLETE,
        completed_at: new Date('2026-05-26T10:00:00.000Z'),
        unlocked_at: new Date('2026-05-26T09:00:00.000Z'),
      } as FunnelStage)
      .mockResolvedValueOnce({
        id: NEXT_STAGE_ID,
        funnel_id: FUNNEL_ID,
        position: 2,
        name: 'Spark Interest',
        status: StageStatus.ACTIVE,
        completed_at: null,
        unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
      } as FunnelStage);
    funnelAction.findNextStage.mockResolvedValue({
      id: NEXT_STAGE_ID,
      funnel_id: FUNNEL_ID,
      position: 2,
      name: 'Spark Interest',
      status: StageStatus.ACTIVE,
      completed_at: null,
      unlocked_at: new Date('2026-05-26T10:00:00.000Z'),
    } as FunnelStage);

    const result = await service.completeStage(FUNNEL_ID, STAGE_ID, USER_ID);

    expect(result.message).toBe(SYS_MSG.STAGE_ALREADY_COMPLETE);
    expect(result.data.completedStage.status).toBe(StageStatus.COMPLETE);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});