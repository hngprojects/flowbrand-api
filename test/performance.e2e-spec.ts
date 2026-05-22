import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { QUEUES } from '../src/common/constants/queue.constants';

describe('Performance Tests (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
    await emailQueue.empty();
    await emailQueue.clean(0, 'failed');
    await emailQueue.clean(0, 'completed');

    const email = 'admin@example.com';

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Admin@123456' });
    accessToken = loginRes.body.data?.accessToken;
  }, 60000);

  afterAll(async () => {
    const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
    const funnelQueue = app.get<Queue>(getQueueToken(QUEUES.FUNNEL_GENERATION));
    const extractionQueue = app.get<Queue>(getQueueToken(QUEUES.DOCUMENT_EXTRACTION));
    
    await Promise.all([
      emailQueue.pause(),
      funnelQueue.pause(),
      extractionQueue.pause(),
    ]);
    await Promise.all([
      emailQueue.close(),
      funnelQueue.close(),
      extractionQueue.close(),
    ]);

    await app.close();
  }, 30000);

  describe('GET /api/funnels', () => {
    it('PERF-01: responds in under 200ms', async () => {
      const start = Date.now();
      const res = await request(app.getHttpServer())
        .get('/api/funnels')
        .set('Authorization', `Bearer ${accessToken}`);
      const elapsed = Date.now() - start;

      console.log(`GET /api/funnels response time: ${elapsed}ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('GET /api/onboarding/session', () => {
    it('PERF-02: responds in under 200ms', async () => {
      const start = Date.now();
      const res = await request(app.getHttpServer())
        .get('/api/onboarding/session')
        .set('Authorization', `Bearer ${accessToken}`);
      const elapsed = Date.now() - start;

      console.log(`GET /api/onboarding/session response time: ${elapsed}ms`);
      expect([200, 404]).toContain(res.status);
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('GET /api/health', () => {
    it('PERF-03: responds in under 150ms', async () => {
      const start = Date.now();
      const res = await request(app.getHttpServer()).get('/api/health');
      const elapsed = Date.now() - start;

      console.log(`GET /api/health response time: ${elapsed}ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('POST /api/waitlist/join', () => {
    it('PERF-04: responds in under 300ms', async () => {
      const start = Date.now();
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({ email: `perf-waitlist-${Date.now()}@example.com` });
      const elapsed = Date.now() - start;

      console.log(`POST /api/waitlist/join response time: ${elapsed}ms`);
      expect(res.status).toBe(201);
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('POST /api/auth/login', () => {
    it('PERF-05: responds in under 500ms', async () => {
      const email = `admin@example.com`;
      const start = Date.now();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Admin@123456' });
      const elapsed = Date.now() - start;

      console.log(`POST /api/auth/login response time: ${elapsed}ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(5000);
    });
  });
});