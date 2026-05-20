import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { HttpStatus } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthController } from '../health.controller';
import { QUEUES } from '../../../common/constants/queue.constants';
import * as SYS_MSG from '../../../constants/system.messages';

const mockFunnelQueue = { getJobCounts: jest.fn() };
const mockDataSource = { query: jest.fn() };

function buildMockRes() {
  return { status: jest.fn().mockReturnThis() } as unknown as import('express').Response;
}

describe('HealthController', () => {
  let module: TestingModule;
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
      controllers: [HealthController],
      providers: [
        { provide: getQueueToken(QUEUES.FUNNEL_GENERATION), useValue: mockFunnelQueue },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('AC-04 — both services healthy', () => {
    it('returns status ok when queue and DB both resolve', async () => {
      mockFunnelQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0 });
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);

      const res = buildMockRes();
      const result = await controller.check(res);

      expect(result.status).toBe(SYS_MSG.HEALTH_OK);
      expect(result.services.queue).toBe(SYS_MSG.HEALTH_SERVICE_UP);
      expect(result.services.database).toBe(SYS_MSG.HEALTH_SERVICE_UP);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('response shape always includes status, timestamp, services.database and services.queue', async () => {
      mockFunnelQueue.getJobCounts.mockResolvedValue({});
      mockDataSource.query.mockResolvedValue([]);

      const result = await controller.check(buildMockRes());

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('services.database');
      expect(result).toHaveProperty('services.queue');
    });

    it('timestamp is a valid ISO string', async () => {
      mockFunnelQueue.getJobCounts.mockResolvedValue({});
      mockDataSource.query.mockResolvedValue([]);

      const result = await controller.check(buildMockRes());

      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe('AC-05 / AC-09 — queue degraded', () => {
    it('returns 503 and status degraded and queue down when getJobCounts throws', async () => {
      mockFunnelQueue.getJobCounts.mockRejectedValue(new Error('ECONNREFUSED'));
      mockDataSource.query.mockResolvedValue([]);

      const res = buildMockRes();
      const result = await controller.check(res);

      expect(result.status).toBe(SYS_MSG.HEALTH_DEGRADED);
      expect(result.services.queue).toBe(SYS_MSG.HEALTH_SERVICE_DOWN);
      expect(result.services.database).toBe(SYS_MSG.HEALTH_SERVICE_UP);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('never throws — always returns a response object when queue is down', async () => {
      mockFunnelQueue.getJobCounts.mockRejectedValue(new Error('Redis down'));
      mockDataSource.query.mockResolvedValue([]);

      await expect(controller.check(buildMockRes())).resolves.toBeDefined();
    });
  });

  describe('AC-09 — database degraded', () => {
    it('returns 503 and status degraded and database down when DB query throws', async () => {
      mockFunnelQueue.getJobCounts.mockResolvedValue({});
      mockDataSource.query.mockRejectedValue(new Error('connection refused'));

      const res = buildMockRes();
      const result = await controller.check(res);

      expect(result.status).toBe(SYS_MSG.HEALTH_DEGRADED);
      expect(result.services.database).toBe(SYS_MSG.HEALTH_SERVICE_DOWN);
      expect(result.services.queue).toBe(SYS_MSG.HEALTH_SERVICE_UP);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });

  describe('AC-09 — both degraded', () => {
    it('returns 503 and status degraded when both queue and DB throw', async () => {
      mockFunnelQueue.getJobCounts.mockRejectedValue(new Error('Redis down'));
      mockDataSource.query.mockRejectedValue(new Error('DB down'));

      const res = buildMockRes();
      const result = await controller.check(res);

      expect(result.status).toBe(SYS_MSG.HEALTH_DEGRADED);
      expect(result.services.queue).toBe(SYS_MSG.HEALTH_SERVICE_DOWN);
      expect(result.services.database).toBe(SYS_MSG.HEALTH_SERVICE_DOWN);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });

  describe('EC-04 — 2-second timeout on queue check', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('marks queue as down when getJobCounts does not resolve within 2 seconds', async () => {
      mockFunnelQueue.getJobCounts.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      mockDataSource.query.mockResolvedValue([]);

      const resultPromise = controller.check(buildMockRes());
      jest.advanceTimersByTime(2001);

      const result = await resultPromise;
      expect(result.services.queue).toBe(SYS_MSG.HEALTH_SERVICE_DOWN);
      expect(result.status).toBe(SYS_MSG.HEALTH_DEGRADED);
    });

    it('marks queue as up when getJobCounts resolves before the 2-second deadline', async () => {
      mockFunnelQueue.getJobCounts.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 500)),
      );
      mockDataSource.query.mockResolvedValue([]);

      const resultPromise = controller.check(buildMockRes());
      jest.advanceTimersByTime(501);

      const result = await resultPromise;
      expect(result.services.queue).toBe(SYS_MSG.HEALTH_SERVICE_UP);
    });

    it('marks db as down when query does not resolve within 2 seconds', async () => {
      mockFunnelQueue.getJobCounts.mockResolvedValue({});
      mockDataSource.query.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const resultPromise = controller.check(buildMockRes());
      jest.advanceTimersByTime(2001);

      const result = await resultPromise;
      expect(result.services.database).toBe(SYS_MSG.HEALTH_SERVICE_DOWN);
      expect(result.status).toBe(SYS_MSG.HEALTH_DEGRADED);
    });
  });
});
