import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { QUEUES } from '../src/common/constants/queue.constants';
import { DataSource } from 'typeorm';

describe('Onboarding (e2e)', () => {
    jest.setTimeout(30000)
  let app: INestApplication<App>;
  let accessToken: string;
  let sessionId: string;

  const testEmail = 'admin@example.com';
  const testPassword = 'Admin@123456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Clean up admin's previous onboarding session
    const dataSource = app.get<DataSource>(DataSource);
    await dataSource.query(
    `DELETE FROM wizard_sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    ['admin@example.com']
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });

    accessToken = loginRes.body.data.accessToken;
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

  describe('POST /api/onboarding/start', () => {
    it('AC-01: creates a new onboarding session and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.session_id).toBeDefined();
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.steps_completed).toBe(0);
      sessionId = res.body.data.session_id;
    });

    it('AC-02: calling start again returns 200 with the same session (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.session_id).toBe(sessionId);
    });

    it('AC-03: returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/start');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/onboarding/session', () => {
    it('AC-04: returns active session for authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/onboarding/session')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.sessionId).toBeDefined();
      expect(res.body.data.status).toBe('in_progress');
    });

    it('AC-05: returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/onboarding/session');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/onboarding/step', () => {
    it('AC-06: saves step 1 answer and returns steps_completed = 1', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: sessionId,
          step: 1,
          answer: { business_description: 'We sell handmade shoes in Lagos' },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.data.steps_completed).toBe(1);
      expect(res.body.data.data.answers.step_1).toBeDefined();
    });

    it('AC-07: saves step 2 answer and returns steps_completed = 2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: sessionId,
          step: 2,
          answer: {
            customer_tags: { type: ['retail', 'wholesale'] },
            additional_notes: 'Young professionals',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.data.steps_completed).toBe(2);
    });

    it('AC-08: saves step 3 answer and returns steps_completed = 3', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: sessionId,
          step: 3,
          answer: { discovery_channel: 'Instagram' },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.data.steps_completed).toBe(3);
    });

    it('AC-09: returns 422 when step 1 answer fails validation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: sessionId,
          step: 1,
          answer: { business_description: 'x'.repeat(501) },
        });

      expect(res.status).toBe(422);
    });

    it('AC-10: returns 404 when session_id does not belong to user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: '00000000-0000-4000-8000-000000000000',
          step: 1,
          answer: { business_description: 'Test business' },
        });

      expect(res.status).toBe(404);
    });

    it('AC-11: returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step')
        .send({
          session_id: sessionId,
          step: 1,
          answer: { business_description: 'Test' },
        });

      expect(res.status).toBe(401);
    });
  });
});