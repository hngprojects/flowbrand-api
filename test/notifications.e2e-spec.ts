import { getQueueToken } from '@nestjs/bull';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Queue } from 'bull';
import request from 'supertest';
import { App } from 'supertest/types';
import { QUEUES } from '../src/common/constants/queue.constants';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { AppModule } from './../src/app.module';

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let userAToken = '';
  let userBToken = '';
  let userAId = '';
  const createdNotificationIds: string[] = [];
  const createdUserIds: string[] = [];

  jest.setTimeout(60000);

  async function createVerifiedUser(email: string, fullName: string) {
    const userRepository = app.get(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('Admin@123456', 10);

    const user = await userRepository.save({
      email,
      full_name: fullName,
      password_hash: passwordHash,
      country: null,
      is_verified: true,
      is_active: true,
      avatar_url: null,
      auth_provider: 'local',
      provider_user_id: null,
      termsAccepted: true,
      business_type: null,
      target_customer: null,
      primary_goal: null,
    });

    createdUserIds.push(user.id);
    return user;
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Admin@123456' });

    expect(response.status).toBe(200);
    return response.body.data.accessToken as string;
  }

  async function createNotification(userId: string, title: string, isRead = false) {
    const notificationRepository = app.get(getRepositoryToken(Notification));
    const notification = await notificationRepository.save({
      user_id: userId,
      type: 'feed_event',
      title,
      body: `${title} body`,
      metadata: { source: 'notifications-e2e' },
      is_read: isRead,
      read_at: isRead ? new Date() : null,
    });

    createdNotificationIds.push(notification.id);
    return notification;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const userA = await createVerifiedUser(`notif-a-${Date.now()}@example.com`, 'Notif User A');
    const userB = await createVerifiedUser(`notif-b-${Date.now()}@example.com`, 'Notif User B');

    userAId = userA.id;
    userAToken = await login(userA.email);
    userBToken = await login(userB.email);

    await createNotification(userAId, 'Notification One', false);
    await createNotification(userAId, 'Notification Two', false);
    await createNotification(userAId, 'Notification Three', true);
  }, 60000);

  afterAll(async () => {
    const notificationRepository = app.get(getRepositoryToken(Notification));
    const userRepository = app.get(getRepositoryToken(User));

    if (createdNotificationIds.length) {
      await notificationRepository.delete(createdNotificationIds);
    }

    if (createdUserIds.length) {
      await userRepository.delete(createdUserIds);
    }

    const emailQueue = app.get<Queue>(getQueueToken(QUEUES.EMAIL));
    const funnelQueue = app.get<Queue>(getQueueToken(QUEUES.FUNNEL_GENERATION));
    const extractionQueue = app.get<Queue>(getQueueToken(QUEUES.DOCUMENT_EXTRACTION));

    await Promise.all([emailQueue.pause(), funnelQueue.pause(), extractionQueue.pause()]);
    await Promise.all([emailQueue.close(), funnelQueue.close(), extractionQueue.close()]);
    await app.close();
  }, 60000);

  it('AC-13: returns 401 without a JWT', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/notifications');

    expect(response.status).toBe(401);
  });

  it('AC-04: returns an empty feed and zero unread count for a user with no notifications', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.unread_count).toBe(0);
  });

  it('AC-01: returns the newest notifications first with the correct unread count', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.total_count).toBe(3);
    expect(response.body.data.unread_count).toBe(2);
    expect(response.body.data.items[0].title).toBe('Notification Three');
  });

  it('AC-02/AC-03: filters unread and read notifications correctly', async () => {
    const unreadResponse = await request(app.getHttpServer())
      .get('/api/v1/notifications?filter=unread')
      .set('Authorization', `Bearer ${userAToken}`);

    const readResponse = await request(app.getHttpServer())
      .get('/api/v1/notifications?filter=read')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(unreadResponse.status).toBe(200);
    expect(unreadResponse.body.data.items.every((notification: { is_read: boolean }) => notification.is_read === false)).toBe(true);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.data.items.every((notification: { is_read: boolean }) => notification.is_read === true)).toBe(true);
  });

  it('EC-03: caps per_page at 50', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications?per_page=200')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.per_page).toBe(50);
  });

  it('AC-05: returns the unread badge count endpoint value', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(2);
  });

  it('AC-06/AC-07: marks a single notification as read and keeps the operation idempotent', async () => {
    const notificationRepository = app.get(getRepositoryToken(Notification));
    const notification = await notificationRepository.findOneByOrFail({ title: 'Notification One', user_id: userAId });

    const firstResponse = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${userAToken}`);

    const refreshed = await notificationRepository.findOneByOrFail({ id: notification.id });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data.is_read).toBe(true);
    expect(refreshed.is_read).toBe(true);
    expect(refreshed.read_at).not.toBeNull();

    const secondResponse = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data.is_read).toBe(true);
  });

  it('AC-08: returns 404 when a notification belongs to another user', async () => {
    const notificationRepository = app.get(getRepositoryToken(Notification));
    const notification = await notificationRepository.findOneByOrFail({ title: 'Notification Two', user_id: userAId });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(response.status).toBe(404);
  });

  it('AC-09/AC-10: marks all notifications as read and unread with scoped bulk updates', async () => {
    const markAllReadResponse = await request(app.getHttpServer())
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(markAllReadResponse.status).toBe(200);
    expect(markAllReadResponse.body.data.updated_count).toBeGreaterThanOrEqual(0);

    const unreadAfterReadAll = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(unreadAfterReadAll.body.data.count).toBe(0);

    const markAllUnreadResponse = await request(app.getHttpServer())
      .patch('/api/v1/notifications/mark-all-unread')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(markAllUnreadResponse.status).toBe(200);
    expect(markAllUnreadResponse.body.data.updated_count).toBeGreaterThanOrEqual(0);
  });

  it('AC-11/AC-12: deletes only the current user notification and hides it from subsequent feeds', async () => {
    const notificationRepository = app.get(getRepositoryToken(Notification));
    const notification = await notificationRepository.findOneByOrFail({ title: 'Notification Three', user_id: userAId });

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/notifications/${notification.id}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(deleteResponse.status).toBe(200);

    const followUp = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(followUp.body.data.items.some((item: { id: string }) => item.id === notification.id)).toBe(false);
  });

  it('EC-04/SEC-02: rejects invalid UUIDs with 400', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/notifications/not-a-uuid/read')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(response.status).toBe(400);
  });
});