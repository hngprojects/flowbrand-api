import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { NotificationsController } from '../controllers/notifications.controller';
import { NotificationFilter } from '../enums/notification-filter.enum';
import { NotificationsService } from '../notifications.service';

describe('NotificationsController', () => {
  let app: INestApplication<App>;
  const notificationsServiceMock = {
    getFeed: jest.fn(),
    getUnreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllAsRead: jest.fn(),
    markAllAsUnread: jest.fn(),
    deleteNotification: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notificationsServiceMock }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AC-01/EC-02: returns the feed envelope for valid requests', async () => {
    notificationsServiceMock.getFeed.mockResolvedValue({
      items: [],
      total_count: 0,
      unread_count: 0,
      page: 1,
      per_page: 20,
      has_next: false,
    });

    const response = await request(app.getHttpServer()).get('/v1/notifications');

    expect(response.status).toBe(200);
    expect(response.body.data.total_count).toBe(0);
    expect(notificationsServiceMock.getFeed).toHaveBeenCalledWith(undefined, NotificationFilter.ALL, 1, 20);
  });

  it('EC-04/SEC-02: rejects invalid UUIDs before invoking the service', async () => {
    const response = await request(app.getHttpServer()).patch('/v1/notifications/not-a-uuid/read');

    expect(response.status).toBe(400);
    expect(notificationsServiceMock.markRead).not.toHaveBeenCalled();
  });
});