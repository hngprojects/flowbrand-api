import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { QUEUES } from '../src/common/constants/queue.constants';

describe('Contact (e2e)', () => {
  let app: INestApplication<App>;

  jest.setTimeout(30000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 30000);

  afterAll(async () => {
      const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
      const funnelQueue = app.get<Queue>(getQueueToken(QUEUES.FUNNEL_GENERATION));
      const extractionQueue = app.get<Queue>(getQueueToken(QUEUES.DOCUMENT_EXTRACTION));
      
      try {
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
      } finally {
         await app.close();
      }
    }, 30000);

  describe('POST /api/contact', () => {
    const validDto = {
      fullName: 'John Doe',
      email: 'john@example.com',
      businessName: 'Acme Inc',
      message: 'I would like to inquire about your funnel building services please.',
    };

    it('AC-01: submits a contact form and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send(validDto);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe(validDto.fullName);
      expect(res.body.data.email).toBe(validDto.email);
      expect(res.body.data.status).toBe('pending');
    });

    it('AC-02: does not require authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send(validDto);

      expect(res.status).toBe(201);
    });

    it('AC-03: returns 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send({ fullName: 'John' });

      expect(res.status).toBe(400);
    });

    it('AC-04: returns 400 when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send({ ...validDto, email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('AC-05: returns 400 when message contains spam keywords', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send({ ...validDto, message: 'Buy cheap Bitcoin now click here!' });

      expect(res.status).toBe(400);
    });

    it('AC-06: returns 400 when message contains too many links', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/contact')
        .send({
          ...validDto,
          message: 'Check http://site1.com and http://site2.com and http://site3.com',
        });

      expect(res.status).toBe(400);
    });
  });
});