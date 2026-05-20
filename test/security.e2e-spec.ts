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
    const userAEmail = `security-user-a-${Date.now()}@example.com`;
    const userBEmail = `security-user-b-${Date.now() + 1}@example.com`;

    // Clear stale jobs from previous test runs
    const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
    await emailQueue.empty();
    await emailQueue.clean(0, 'failed');
    await emailQueue.clean(0, 'completed');

    // Register user A
    await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: userAEmail, password: 'Test@12345', fullName: 'User A', termsAccepted: true });

    const loginA = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: userAEmail, password: 'Test@12345' });
    userAToken = loginA.body.data.accessToken;

    // Register user B  
    await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: userBEmail, password: 'Test@12345', fullName: 'User B', termsAccepted: true });

    const loginB = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: userBEmail, password: 'Test@12345' });
    userBToken = loginB.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
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
        .send({ email: `sec-test-${Date.now()}@example.com` });

      expect(res.status).toBe(201);
    });

    it('POST /api/contact is public', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send({
          fullName: 'Security Test',
          email: 'sec@example.com',
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