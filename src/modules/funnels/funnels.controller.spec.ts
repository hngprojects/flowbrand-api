import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { FunnelsController } from './funnels.controller';
import { FunnelsService as FunnelsReadService } from './funnels.service';
import { FunnelsService as FunnelsGenService } from './services/funnels.service';
import { StageStatus } from './enums/stage-status.enum';

const READ_SERVICE_MOCK = {
  listForUser: jest.fn(),
  getFullFunnel: jest.fn(),
  getStagesSummary: jest.fn(),
  getStageDetail: jest.fn(),
};

const GEN_SERVICE_MOCK = {
  createGeneration: jest.fn(),
  getStatus: jest.fn(),
  completeStage: jest.fn(),
};

describe('FunnelsController - stage completion route', () => {
  let controller: FunnelsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FunnelsController],
      providers: [
        { provide: FunnelsReadService, useValue: READ_SERVICE_MOCK },
        { provide: FunnelsGenService, useValue: GEN_SERVICE_MOCK },
      ],
    }).compile();

    controller = module.get(FunnelsController);
  });

  it('returns the service payload and sets HTTP 200 for stage completion', async () => {
    GEN_SERVICE_MOCK.completeStage.mockResolvedValue({
      statusCode: HttpStatus.OK,
      message: 'Stage completed successfully',
      data: {
        completedStage: {
          stageId: 'stage-1',
          position: 1,
          name: 'Get Noticed',
          status: StageStatus.COMPLETE,
          completedAt: '2026-05-26T10:00:00.000Z',
        },
        unlockedStage: {
          stageId: 'stage-2',
          position: 2,
          name: 'Spark Interest',
          status: StageStatus.ACTIVE,
          unlockedAt: '2026-05-26T10:00:00.000Z',
        },
      },
    });

    const res = { status: jest.fn().mockReturnThis() } as unknown as Response;

    const result = await controller.completeStage('funnel-1', 'stage-1', 'user-1', res);

    expect(GEN_SERVICE_MOCK.completeStage).toHaveBeenCalledWith('stage-1', 'user-1', 'funnel-1');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(result).toEqual(expect.objectContaining({ statusCode: HttpStatus.OK }));
  });

  it('passes through idempotent complete responses from the service', async () => {
    GEN_SERVICE_MOCK.completeStage.mockResolvedValue({
      statusCode: HttpStatus.OK,
      message: 'Stage already complete',
      data: {
        completedStage: {
          stageId: 'stage-1',
          position: 1,
          name: 'Get Noticed',
          status: StageStatus.COMPLETE,
          completedAt: '2026-05-26T10:00:00.000Z',
        },
        unlockedStage: null,
      },
    });

    const res = { status: jest.fn().mockReturnThis() } as unknown as Response;

    const result = await controller.completeStage('funnel-1', 'stage-1', 'user-1', res);

    expect(result.message).toBe('Stage already complete');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });
});