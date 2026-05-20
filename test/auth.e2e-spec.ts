import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  const testEmail = `e2e-test-${Date.now()}@example.com`;
  const testPassword = 'Test@12345';
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('AC-01: registers a new user and returns 201 with accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          fullName: 'E2E Test User',
          termsAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBeDefined();
      accessToken = res.body.data.accessToken;
    });

    it('AC-02: returns 409 when email already exists', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          fullName: 'E2E Test User',
          termsAccepted: true,
        });

      expect(res.status).toBe(409);
    });

    it('AC-03: returns 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'incomplete@example.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('AC-04: logs in with valid credentials and returns accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      accessToken = res.body.data.accessToken;
    });

    it('AC-05: returns 401 with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
    });

    it('AC-06: returns 401 when user does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: testPassword });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('AC-07: returns current user when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testEmail);
    });

    it('AC-08: returns 401 when no token provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('AC-09: returns 401 with invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });
  });
});