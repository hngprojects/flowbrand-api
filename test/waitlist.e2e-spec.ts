import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Waitlist (e2e)', () => {
  let app: INestApplication<App>;

  const testEmail = `e2e-waitlist-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 30000);

  jest.setTimeout(30000);

  describe('POST /api/waitlist/join', () => {
    it('AC-01: joins waitlist with valid email and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({ email: testEmail });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe(testEmail);
    });

    it('AC-02: joining again with same email returns 200 (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({ email: testEmail });

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testEmail);
    });

    it('AC-03: returns 400 when email is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({});

      expect(res.status).toBe(400);
    });

    it('AC-04: returns 400 when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('AC-05: does not require authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/waitlist/join')
        .send({ email: `public-${Date.now()}@example.com` });

      expect(res.status).toBe(201);
    });
  });
});