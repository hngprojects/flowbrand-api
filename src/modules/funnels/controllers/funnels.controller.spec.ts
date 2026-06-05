import { HttpStatus, UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import * as SYS_MSG from '../../../constants/system.messages';
import { FunnelsController } from '../controllers/funnels.controller';
import { FunnelsService } from '../services/funnels.service';
import { RenameFunnelDto } from '../dto/rename-funnel.dto';
import { StageStatus } from '../enums/stage-status.enum';

const SERVICE_MOCK = {
  listForUser: jest.fn(),
  getFullFunnel: jest.fn(),
  getStagesSummary: jest.fn(),
  getStageDetail: jest.fn(),
  createGeneration: jest.fn(),
  getStatus: jest.fn(),
  completeStage: jest.fn(),
  submitFeedback: jest.fn(),
  deleteFunnel: jest.fn(),
  renameFunnel: jest.fn(),
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

    const result = await controller.completeStage('user-1', 'funnel-1', 'stage-1');

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

    const result = await controller.completeStage('user-1', 'funnel-1', 'stage-1');

    expect(SERVICE_MOCK.completeStage).toHaveBeenCalledWith('funnel-1', 'stage-1', 'user-1');
    expect(result).toEqual(expect.objectContaining({ statusCode: HttpStatus.OK }));
  });
});

describe('FunnelsController - delete funnel route', () => {
  let controller: FunnelsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FunnelsController],
      providers: [{ provide: FunnelsService, useValue: SERVICE_MOCK }],
    }).compile();

    controller = module.get(FunnelsController);
  });

  it('delegates to deleteFunnel and returns structured 200 payload', async () => {
    SERVICE_MOCK.deleteFunnel.mockResolvedValue({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_DELETED,
    });

    const result = await controller.remove('user-1', '22222222-2222-4222-8222-222222222222');

    expect(SERVICE_MOCK.deleteFunnel).toHaveBeenCalledWith(
      'user-1',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_DELETED,
    });
  });
});

describe('FunnelsController - rename route', () => {
  let controller: FunnelsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FunnelsController],
      providers: [{ provide: FunnelsService, useValue: SERVICE_MOCK }],
    }).compile();

    controller = module.get(FunnelsController);
  });

  it('AC-01: delegates to renameFunnel and returns structured 200 payload', async () => {
    const renameData = {
      id: '22222222-2222-4222-8222-222222222222',
      funnelName: 'Jollof Spot',
      status: 'active',
      creationPath: 'wizard',
      createdAt: '2026-05-18T12:00:00.000Z',
      updatedAt: '2026-05-26T10:00:00.000Z',
    };
    SERVICE_MOCK.renameFunnel.mockResolvedValue(renameData);

    const result = await controller.rename('user-1', '22222222-2222-4222-8222-222222222222', {
      funnelName: 'Jollof Spot',
    });

    expect(SERVICE_MOCK.renameFunnel).toHaveBeenCalledWith('user-1', '22222222-2222-4222-8222-222222222222', {
      funnelName: 'Jollof Spot',
    });
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_RENAMED_SUCCESSFULLY,
      data: renameData,
    });
  });

  it('AC-09: returns flattened string details on validation failure', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      expectedType: RenameFunnelDto,
      validationError: { target: false, value: false },
      exceptionFactory: (errors: ValidationError[]) =>
        new UnprocessableEntityException({
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.VALIDATION_FAILED,
          details: errors.flatMap((error) =>
            error.constraints ? Object.values(error.constraints).map((m) => `${error.property}: ${m}`) : [],
          ),
        }),
    });

    try {
      await pipe.transform(
        { funnelName: '', extra_field: 'nope' },
        { type: 'body', metatype: RenameFunnelDto, data: '' },
      );
      fail('Expected validation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const response = (error as UnprocessableEntityException).getResponse() as {
        details: string[];
      };
      expect(Array.isArray(response.details)).toBe(true);
      expect(response.details.every((item) => typeof item === 'string')).toBe(true);
      expect(response.details.some((item) => item.includes('funnelName'))).toBe(true);
    }
  });
});

describe('FunnelsController - submit feedback route', () => {
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

  it('passes payload to service and returns 201', async () => {
    SERVICE_MOCK.submitFeedback.mockResolvedValue({
      statusCode: HttpStatus.CREATED,
      message: 'Feedback submitted successfully',
      data: { feedbackId: 'fb-1', stageId: 'stage-1', comment: 'Great', submittedAt: '2026-05-26T10:00:00Z' },
    });

    const result = await controller.submitFeedback('user-1', 'funnel-1', 'stage-1', { comment: 'Great' });

    expect(SERVICE_MOCK.submitFeedback).toHaveBeenCalledWith('user-1', 'funnel-1', 'stage-1', { comment: 'Great' });
    expect(result.statusCode).toBe(HttpStatus.CREATED);
  });
});
