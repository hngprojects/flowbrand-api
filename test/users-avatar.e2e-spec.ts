import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { QUEUES } from '../src/common/constants/queue.constants';

describe('Users Avatar (e2e)', () => {
  let app: INestApplication<App>;

  const testEmail = 'admin@example.com';
  const testPassword = 'Admin@123456';
  const onePixelPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7f4b4AAAAASUVORK5CYII=',
    'base64',
  );

  const loginAndGetToken = async (): Promise<string> => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: testEmail,
      password: testPassword,
    });

    expect(login.status).toBe(200);
    return login.body.data.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const dataSource = app.get(DataSource);
    await dataSource
      .createQueryBuilder()
      .update('users')
      .set({ is_verified: true })
      .where('email = :email', { email: testEmail })
      .execute();
  }, 30000);

  afterAll(async () => {
    try {
      const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
      const funnelQueue = app.get<Queue>(getQueueToken(QUEUES.FUNNEL_GENERATION));
      const extractionQueue = app.get<Queue>(getQueueToken(QUEUES.DOCUMENT_EXTRACTION));

      await Promise.all([emailQueue.pause(), funnelQueue.pause(), extractionQueue.pause()]);
      await Promise.all([emailQueue.close(), funnelQueue.close(), extractionQueue.close()]);
    } finally {
      await app.close();
    }
  }, 30000);

  it('AC-07: unauthenticated upload request returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .attach('avatar', onePixelPngBuffer, 'avatar.png');

    expect(res.status).toBe(401);
  });

  it('AC-01: valid PNG upload stores avatar and returns 200 with avatarUrl', async () => {
    const token = await loginAndGetToken();

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', onePixelPngBuffer, 'avatar.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toEqual(expect.any(String));
  });

  it('AC-02 + EC-02: spoofed PDF renamed as .jpg returns 422', async () => {
    const token = await loginAndGetToken();
    const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', fakePdf, 'avatar.jpg');

    expect(res.status).toBe(422);
  });

  it('AC-03: file above 2MB returns 422', async () => {
    const token = await loginAndGetToken();
    const tooLargeBuffer = Buffer.alloc(2 * 1024 * 1024 + 1, 1);

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', tooLargeBuffer, 'avatar.png');

    expect(res.status).toBe(422);
  });

  it('AC-04: second upload replaces previous avatar and returns a new URL', async () => {
    const token = await loginAndGetToken();

    const firstUpload = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', onePixelPngBuffer, 'first.png');

    const secondUpload = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', onePixelPngBuffer, 'second.png');

    expect(firstUpload.status).toBe(200);
    expect(secondUpload.status).toBe(200);
    expect(secondUpload.body.data.avatarUrl).toEqual(expect.any(String));
    expect(secondUpload.body.data.avatarUrl).not.toEqual(firstUpload.body.data.avatarUrl);
  });

  it('AC-05: delete avatar removes it and returns avatarUrl null', async () => {
    const token = await loginAndGetToken();

    await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', onePixelPngBuffer, 'to-delete.png');

    const res = await request(app.getHttpServer())
      .delete('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBeNull();
  });

  it('AC-06: deleting when avatar is already null returns 200 no-op', async () => {
    const token = await loginAndGetToken();

    await request(app.getHttpServer())
      .delete('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app.getHttpServer())
      .delete('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBeNull();
  });
});
