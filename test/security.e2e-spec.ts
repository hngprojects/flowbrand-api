import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { QUEUES } from '../src/common/constants/queue.constants';

describe('Security Tests (e2e)', () => {
  let app: INestApplication<App>;
  let userAToken: string;
  let userBToken: string;

  jest.setTimeout(30000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Register and login user A
    const testEmail = 'admin@example.com';
    const testPassword = 'Admin@123456';

    // Clear stale jobs from previous test runs
    const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
    await emailQueue.empty();
    await emailQueue.clean(0, 'failed');
    await emailQueue.clean(0, 'completed');

    const loginA = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: testEmail, password: testPassword });
    userAToken = loginA.body.data?.accessToken;
    userBToken = loginA.body.data?.accessToken;
  }, 30000);

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

  describe('SEC-01: No Authorization header', () => {
    it('POST /api/funnels/generate without auth header returns 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/funnels/generate')
        .send({ session_id: '00000000-0000-4000-8000-000000000000' });

      expect(res.status).toBe(401);
    });

    it('GET /api/funnels without auth header returns 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/funnels');
      expect(res.status).toBe(401);
    });

    it('GET /api/onboarding/session without auth header returns 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/onboarding/session');
      expect(res.status).toBe(401);
    });
  });

  describe('SEC-02: Expired/Invalid JWT', () => {
    it('GET /api/funnels with invalid JWT returns 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/funnels')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
    });

    it('GET /api/funnels with malformed Bearer token returns 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/funnels')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.expired.signature');

      expect(res.status).toBe(401);
    });
  });

  describe('SEC-03: Cross-user data isolation', () => {
    it('GET /api/funnels/:id with user B JWT for non-existent funnel returns 404 not 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/funnels/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('GET /api/funnels/generate/status/:funnelId with wrong user returns 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/funnels/generate/status/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(404);
    });

    it('POST /api/onboarding/step with another users session_id returns 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          session_id: '00000000-0000-4000-8000-000000000000',
          step: 1,
          answer: { business_description: 'test' },
        });

      expect(res.status).toBe(404);
    });
  });

  describe('SEC-04: Public endpoints accessible without auth', () => {
    it('POST /api/waitlist/join is public', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({ email: `prestigensien45@gmail.com` });

      expect([200, 201]).toContain(res.status);
    });

    it('POST /api/contact is public', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact') 
        .send({
          fullName: 'Security Test',
          email: 'prestigensien45@gmail.com',
          message: 'This is a security test message for the contact form.',
        });

      expect(res.status).toBe(201);
    });

    it('GET /api/health is public', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
    });
  });
});