import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { FunnelsController } from '../controllers/funnels.controller';
import { FunnelsService } from '../services/funnels.service';
import { StageStatus } from '../enums/stage-status.enum';

const SERVICE_MOCK = {
  listForUser: jest.fn(),
  getFullFunnel: jest.fn(),
  getStagesSummary: jest.fn(),
  getStageDetail: jest.fn(),
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
        { provide: FunnelsService, useValue: SERVICE_MOCK },
      ],
    }).compile();

    controller = module.get(FunnelsController);
  });

  it('AC-01: returns the service payload and sets HTTP 200 for stage completion', async () => {
    SERVICE_MOCK.completeStage.mockResolvedValue({
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

    const req = { user: { id: 'user-1' } } as any;

    const result = await controller.completeStage(req, 'funnel-1', 'stage-1');

    expect(SERVICE_MOCK.completeStage).toHaveBeenCalledWith('funnel-1', 'stage-1', 'user-1');
    expect(result).toEqual(expect.objectContaining({ statusCode: HttpStatus.OK }));
});

  it('EC-01: passes through idempotent complete responses from the service', async () => {
    SERVICE_MOCK.completeStage.mockResolvedValue({
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

    const req = { user: { id: 'user-1' } } as any;

    const result = await controller.completeStage(req, 'funnel-1', 'stage-1');

    expect(SERVICE_MOCK.completeStage).toHaveBeenCalledWith('funnel-1', 'stage-1', 'user-1');
    expect(result).toEqual(expect.objectContaining({ statusCode: HttpStatus.OK }));
  });
});