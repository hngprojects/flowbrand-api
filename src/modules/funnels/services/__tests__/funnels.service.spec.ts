import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { JOBS, QUEUES } from '../../../../common/constants/queue.constants';
import { WizardSession } from '../../../onboarding/entities/wizzard-session.entity';
import { WizardStatus } from '../../../onboarding/enums/wizzard-status.enum';
import { RedisService } from '../../../redis/redis.service';
import { UploadedDocument } from '../../../upload/entities/uploaded-document.entity';
import { UploadDocumentStatus } from '../../../upload/upload.types';
import { FunnelModelAction } from '../../actions/funnel.action';
import { Funnel } from '../../entities/funnel.entity';
import { FunnelStage } from '../../entities/funnel-stage.entity';
import { FunnelCreationPath } from '../../enums/funnel-creation-path.enum';
import { FunnelStatus } from '../../enums/funnel-status.enum';
import { FunnelsService } from '../funnels.service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';
const FUNNEL_ID = '22222222-2222-4222-8222-222222222222';

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
  let service: FunnelsService;
  let funnelAction: jest.Mocked<FunnelModelAction>;
  let redisService: { rateLimit: jest.Mock };
  let wizardRepo: { findOne: jest.Mock };
  let uploadRepo: { find: jest.Mock };
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

  beforeEach(async () => {
    funnelAction = {
      findByIdempotency: jest.fn(),
      findGeneratingForUser: jest.fn(),
      findOwnedById: jest.fn(),
    } as unknown as jest.Mocked<FunnelModelAction>;

    redisService = { rateLimit: jest.fn().mockResolvedValue({ count: 1, exceeded: false }) };
    wizardRepo = { findOne: jest.fn() };
    uploadRepo = { find: jest.fn() };
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
        { provide: RedisService, useValue: redisService },
        { provide: getRepositoryToken(WizardSession), useValue: wizardRepo },
        { provide: getRepositoryToken(UploadedDocument), useValue: uploadRepo },
        { provide: getQueueToken(QUEUES.FUNNEL_GENERATION), useValue: queue },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(FunnelsService);
  });

  describe('AC-01: happy path returns 202 generating', () => {
    it('AC-01: POST /funnels/generate with valid wizard returns 202 + funnel_id + status=generating', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
      wizardRepo.findOne.mockResolvedValue(COMPLETE_WIZARD);

      const result = await service.createGeneration(USER_ID, BASE_DTO);

      expect(result.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(result.funnelId).toBe(FUNNEL_ID);
      expect(result.status).toBe(FunnelStatus.GENERATING);
    });

    it('AC-01: inserts funnel + 4 stages and dispatches the job before commit', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
      wizardRepo.findOne.mockResolvedValue(COMPLETE_WIZARD);

      await service.createGeneration(USER_ID, BASE_DTO);

      expect(queryRunner.manager.save).toHaveBeenCalledWith(Funnel, expect.any(Object));
      expect(queryRunner.manager.save).toHaveBeenCalledWith(FunnelStage, expect.any(Array));
      const stagesArg = (queryRunner.manager.save.mock.calls.find((c) => c[0] === FunnelStage) ??
        [])[1] as Array<{ position: number; name: string; status: string }>;
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

      // Dispatch BEFORE commit: queue.add called, then commit.
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
      wizardRepo.findOne.mockResolvedValue(null);

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('AC-05: document_upload source validation', () => {
    it('AC-05: returns 422 when any upload is not ready', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
      uploadRepo.find.mockResolvedValue([
        { id: 'u1', user_id: USER_ID, status: UploadDocumentStatus.READY, file_name: 'a.pdf' },
        {
          id: 'u2',
          user_id: USER_ID,
          status: UploadDocumentStatus.PARSING,
          file_name: 'b.pdf',
        },
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
      // Combined query (id IN ids AND user_id = userId) returns nothing for a
      // cross-user upload — the DB filters it out rather than returning it.
      uploadRepo.find.mockResolvedValue([]);

      await expect(
        service.createGeneration(USER_ID, {
          source: FunnelCreationPath.DOCUMENT_UPLOAD,
          idempotency_key: IDEMPOTENCY_KEY,
          upload_ids: ['u1'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('AC-06 / AC-07: status endpoint', () => {
    it('AC-06: returns generating without a redirect field while in flight', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        id: FUNNEL_ID,
        status: FunnelStatus.GENERATING,
      } as Funnel);

      const result = await service.getStatus(FUNNEL_ID, USER_ID);

      expect(result.status).toBe(FunnelStatus.GENERATING);
      expect(result.redirect).toBeUndefined();
    });

    it('AC-07: returns active with redirect to strategy_dashboard once complete', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        id: FUNNEL_ID,
        status: FunnelStatus.ACTIVE,
      } as Funnel);

      const result = await service.getStatus(FUNNEL_ID, USER_ID);

      expect(result.status).toBe(FunnelStatus.ACTIVE);
      expect(result.redirect).toEqual({ to: 'strategy_dashboard' });
    });

    it('returns failed status with error block when generation failed', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        id: FUNNEL_ID,
        status: FunnelStatus.FAILED,
      } as Funnel);

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

  describe('AC-09: rollback on queue dispatch failure', () => {
    it('AC-09: rolls back the transaction and returns 503 when queue.add throws', async () => {
      funnelAction.findByIdempotency.mockResolvedValue(null);
      funnelAction.findGeneratingForUser.mockResolvedValue(null);
      wizardRepo.findOne.mockResolvedValue(COMPLETE_WIZARD);
      queue.add.mockRejectedValueOnce(new Error('Redis is down'));

      await expect(service.createGeneration(USER_ID, BASE_DTO)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('AC-10: status endpoint completes under 100ms', () => {
    it('AC-10: getStatus returns in under 100ms for a populated owned funnel', async () => {
      funnelAction.findOwnedById.mockResolvedValue({
        id: FUNNEL_ID,
        status: FunnelStatus.ACTIVE,
      } as Funnel);

      const start = Date.now();
      await service.getStatus(FUNNEL_ID, USER_ID);
      expect(Date.now() - start).toBeLessThan(100);
    });
  });
});
