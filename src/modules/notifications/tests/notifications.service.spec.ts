import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationModelAction } from '../actions/notification.action';
import { Notification } from '../entities/notification.entity';
import { NotificationFilter } from '../enums/notification-filter.enum';
import { NotificationsService } from '../notifications.service';

const mockNotificationAction = {
  create: jest.fn(),
  listForUserPaginated: jest.fn(),
  countUnread: jest.fn(),
  findOwnedById: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  markAllAsUnread: jest.fn(),
  deleteOwnedById: jest.fn(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: NotificationModelAction, useValue: mockNotificationAction }],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('createNotification', () => {
    it('AC-06: inserts and returns the saved notification', async () => {
      const saved = { id: 'notif-1', user_id: 'user-1', type: 'stage_completed' } as Notification;
      mockNotificationAction.create.mockResolvedValue(saved);

      const result = await service.createNotification('user-1', 'stage_completed', 'Stage done', 'You completed Stage 1');

      expect(mockNotificationAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: expect.objectContaining({ user_id: 'user-1', type: 'stage_completed' }),
        }),
      );
      expect(result).toBe(saved);
    });

    it('AC-07: metadata defaults to {} when not provided', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body');

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.metadata).toEqual({});
    });

    it('EC-03: truncates string values in metadata longer than 500 chars', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body', { note: 'x'.repeat(600) });

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect((createPayload.metadata.note as string).length).toBe(500);
    });

    it('EC-03: leaves string values at or below 500 chars unchanged', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body', { funnelId: 'abc-123' });

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.metadata.funnelId).toBe('abc-123');
    });

    it('EC-03: leaves non-string metadata values unchanged', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body', { count: 42 });

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.metadata.count).toBe(42);
    });
  });

  describe('normalizePagination', () => {
    it('EC-03: caps per_page at 50 and defaults invalid values', () => {
      expect(service.normalizePagination(-1, 120)).toEqual({ page: 1, per_page: 50 });
      expect(service.normalizePagination(undefined, undefined)).toEqual({ page: 1, per_page: 20 });
    });
  });

  describe('getFeed', () => {
    it('AC-01/EC-02: returns paginated items with a separate unread count', async () => {
      const notifications = [
        {
          id: 'notif-1',
          is_read: false,
          type: 'feed_event',
          title: 'T',
          body: 'B',
          read_at: null,
          metadata: {},
          created_at: new Date(),
        } as Notification,
      ];
      mockNotificationAction.listForUserPaginated.mockResolvedValue([notifications, 1]);
      mockNotificationAction.countUnread.mockResolvedValue(1);

      const result = await service.getFeed('user-1', NotificationFilter.UNREAD, 2, 60);

      expect(mockNotificationAction.listForUserPaginated).toHaveBeenCalledWith('user-1', NotificationFilter.UNREAD, 2, 50);
      expect(mockNotificationAction.countUnread).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        items: notifications,
        total_count: 1,
        unread_count: 1,
        page: 2,
        per_page: 50,
        has_next: false,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('AC-05: returns the unread count for the user', async () => {
      mockNotificationAction.countUnread.mockResolvedValue(7);

      await expect(service.getUnreadCount('user-1')).resolves.toEqual({ count: 7 });
    });
  });

  describe('markRead', () => {
    it('AC-07: returns the current state when notification is already read', async () => {
      const notification = { id: 'notif-1', is_read: true } as Notification;
      mockNotificationAction.findOwnedById.mockResolvedValue(notification);

      await expect(service.markRead('user-1', 'notif-1')).resolves.toBe(notification);
      expect(mockNotificationAction.markAsRead).not.toHaveBeenCalled();
    });

    it('AC-06: updates unread notifications and returns the refreshed entity', async () => {
      const before = { id: 'notif-1', is_read: false } as Notification;
      const after = { id: 'notif-1', is_read: true } as Notification;
      mockNotificationAction.findOwnedById.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      mockNotificationAction.markAsRead.mockResolvedValue(1);

      await expect(service.markRead('user-1', 'notif-1')).resolves.toBe(after);
      expect(mockNotificationAction.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('EC-04/SEC-02: throws when the notification does not belong to the user', async () => {
      mockNotificationAction.findOwnedById.mockResolvedValue(null);

      await expect(service.markRead('user-1', 'notif-404')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('bulk updates', () => {
    it('AC-09/EC-01/SEC-03: marks all as read', async () => {
      mockNotificationAction.markAllAsRead.mockResolvedValue(3);

      await expect(service.markAllAsRead('user-1')).resolves.toEqual({ updated_count: 3 });
    });

    it('AC-10/EC-01/SEC-03: marks all as unread', async () => {
      mockNotificationAction.markAllAsUnread.mockResolvedValue(4);

      await expect(service.markAllAsUnread('user-1')).resolves.toEqual({ updated_count: 4 });
    });
  });

  describe('deleteNotification', () => {
    it('AC-11: deletes owned notifications', async () => {
      mockNotificationAction.findOwnedById.mockResolvedValue({ id: 'notif-1' } as Notification);
      mockNotificationAction.deleteOwnedById.mockResolvedValue(1);

      await expect(service.deleteNotification('user-1', 'notif-1')).resolves.toBeUndefined();
      expect(mockNotificationAction.deleteOwnedById).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('AC-12: throws when the notification does not exist', async () => {
      mockNotificationAction.findOwnedById.mockResolvedValue(null);

      await expect(service.deleteNotification('user-1', 'notif-404')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
