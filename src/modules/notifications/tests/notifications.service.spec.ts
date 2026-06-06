import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';
import { NotificationsService } from '../notifications.service';
import { NotificationModelAction } from '../actions/notification.action';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferenceModelAction } from '../actions/notification-preference.action';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationFilter } from '../enums/notification-filter.enum';

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

const mockPreferenceAction = {
  findByUserId: jest.fn(),
  createDefaultForUser: jest.fn(),
  updateByUserId: jest.fn(),
};

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mockPreferences = (): NotificationPreference =>
  ({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: USER_ID,
    email_funnel_ready: true,
    email_stage_unlocked: true,
    email_stage_completed: false,
    email_weekly_digest: true,
    inapp_task_completed: true,
    inapp_stage_unlocked: true,
    created_at: new Date('2026-05-29T10:30:00.000Z'),
    updated_at: new Date('2026-05-29T10:30:00.000Z'),
  }) as NotificationPreference;

const duplicatePreferenceError = (): QueryFailedError =>
  Object.assign(new QueryFailedError('', [], new Error('duplicate key')), {
    driverError: { code: '23505' },
  });

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationModelAction, useValue: mockNotificationAction },
        { provide: NotificationPreferenceModelAction, useValue: mockPreferenceAction },
      ],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('createNotification', () => {
    it('AC-01: inserts and returns the saved notification', async () => {
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

    it('AC-02: metadata defaults to {} when not provided', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body');

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.metadata).toEqual({});
    });

    it('AC-03: truncates type and title before saving', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification(
        'user-1',
        'x'.repeat(60),
        'A'.repeat(130),
        'Body',
      );

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.type).toHaveLength(50);
      expect(createPayload.title).toHaveLength(120);
    });

    it('AC-04: truncates string values in metadata longer than 500 chars', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body', { note: 'x'.repeat(600) });

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect((createPayload.metadata.note as string).length).toBe(500);
    });

    it('AC-05: leaves string values at or below 500 chars unchanged', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body', { funnelId: 'abc-123' });

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.metadata.funnelId).toBe('abc-123');
    });

    it('AC-06: leaves non-string metadata values unchanged', async () => {
      mockNotificationAction.create.mockResolvedValue({} as Notification);

      await service.createNotification('user-1', 'tip', 'Tip', 'Body', { count: 42 });

      const { createPayload } = mockNotificationAction.create.mock.calls[0][0];
      expect(createPayload.metadata.count).toBe(42);
    });
  });

  describe('notification preferences', () => {
    it('AC-07: returns current preferences for an existing record', async () => {
      const existing = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(existing);

      const result = await service.getNotificationPreferences(USER_ID);

      expect(mockPreferenceAction.findByUserId).toHaveBeenCalledWith(USER_ID);
      expect(mockPreferenceAction.createDefaultForUser).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('AC-08: creates default preferences when no record exists', async () => {
      const created = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(null);
      mockPreferenceAction.createDefaultForUser.mockResolvedValue(created);

      const result = await service.getNotificationPreferences(USER_ID);

      expect(mockPreferenceAction.createDefaultForUser).toHaveBeenCalledWith(USER_ID);
      expect(result).toBe(created);
    });

    it('AC-09: returns concurrently created preferences after duplicate insert race', async () => {
      const createdByOtherRequest = mockPreferences();
      mockPreferenceAction.findByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdByOtherRequest);
      mockPreferenceAction.createDefaultForUser.mockRejectedValue(duplicatePreferenceError());

      const result = await service.getNotificationPreferences(USER_ID);

      expect(mockPreferenceAction.createDefaultForUser).toHaveBeenCalledWith(USER_ID);
      expect(mockPreferenceAction.findByUserId).toHaveBeenCalledTimes(2);
      expect(result).toBe(createdByOtherRequest);
    });

    it('AC-10: rethrows non-duplicate errors during default creation', async () => {
      const dbError = new Error('database unavailable');
      mockPreferenceAction.findByUserId.mockResolvedValue(null);
      mockPreferenceAction.createDefaultForUser.mockRejectedValue(dbError);

      const error = await service.getNotificationPreferences(USER_ID).catch(e => e);

      expect(error).toBe(dbError);
    });

    it('AC-11: updates a single email preference and returns updated values', async () => {
      const current = mockPreferences();
      const updated = { ...current, email_weekly_digest: false };
      mockPreferenceAction.findByUserId.mockResolvedValue(current);
      mockPreferenceAction.updateByUserId.mockResolvedValue(updated);

      const result = await service.updateNotificationPreferences(USER_ID, {
        email_weekly_digest: false,
      });

      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledWith(USER_ID, {
        email_weekly_digest: false,
      });
      expect(result.email_weekly_digest).toBe(false);
    });

    it('AC-12: updates only the provided in-app preference', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);
      mockPreferenceAction.updateByUserId.mockResolvedValue({
        ...current,
        inapp_stage_unlocked: false,
      });

      await service.updateNotificationPreferences(USER_ID, {
        inapp_stage_unlocked: false,
      });

      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledWith(USER_ID, {
        inapp_stage_unlocked: false,
      });
    });

    it('AC-13: keeps explicit false boolean values in the update payload', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);
      mockPreferenceAction.updateByUserId.mockResolvedValue({
        ...current,
        email_stage_completed: false,
        inapp_task_completed: false,
      });

      await service.updateNotificationPreferences(USER_ID, {
        email_stage_completed: false,
        inapp_task_completed: false,
      });

      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledWith(USER_ID, {
        email_stage_completed: false,
        inapp_task_completed: false,
      });
    });

    it('AC-14: updates multiple preference channels in one request', async () => {
      const current = mockPreferences();
      const updated = {
        ...current,
        email_funnel_ready: false,
        email_stage_unlocked: false,
        inapp_stage_unlocked: false,
      };
      mockPreferenceAction.findByUserId.mockResolvedValue(current);
      mockPreferenceAction.updateByUserId.mockResolvedValue(updated);

      const result = await service.updateNotificationPreferences(USER_ID, {
        email_funnel_ready: false,
        email_stage_unlocked: false,
        inapp_stage_unlocked: false,
      });

      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledWith(USER_ID, {
        email_funnel_ready: false,
        email_stage_unlocked: false,
        inapp_stage_unlocked: false,
      });
      expect(result).toMatchObject({
        email_funnel_ready: false,
        email_stage_unlocked: false,
        inapp_stage_unlocked: false,
      });
    });

    it('AC-15: empty body returns current preferences without DB write', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);

      const result = await service.updateNotificationPreferences(USER_ID, {});

      expect(mockPreferenceAction.updateByUserId).not.toHaveBeenCalled();
      expect(result).toBe(current);
    });

    it('AC-16: empty body creates defaults when preferences do not exist', async () => {
      const created = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(null);
      mockPreferenceAction.createDefaultForUser.mockResolvedValue(created);

      const result = await service.updateNotificationPreferences(USER_ID, {});

      expect(mockPreferenceAction.createDefaultForUser).toHaveBeenCalledWith(USER_ID);
      expect(mockPreferenceAction.updateByUserId).not.toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('AC-17: unknown fields are ignored by service-level payload filtering', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);

      const result = await service.updateNotificationPreferences(USER_ID, {
        unknown_flag: false,
      } as never);

      expect(mockPreferenceAction.updateByUserId).not.toHaveBeenCalled();
      expect(result).toBe(current);
    });

    it('AC-18: creates defaults before updating when preferences do not exist', async () => {
      const created = mockPreferences();
      const updated = { ...created, email_weekly_digest: false };
      mockPreferenceAction.findByUserId.mockResolvedValue(null);
      mockPreferenceAction.createDefaultForUser.mockResolvedValue(created);
      mockPreferenceAction.updateByUserId.mockResolvedValue(updated);

      const result = await service.updateNotificationPreferences(USER_ID, {
        email_weekly_digest: false,
      });

      expect(mockPreferenceAction.createDefaultForUser).toHaveBeenCalledWith(USER_ID);
      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledWith(USER_ID, {
        email_weekly_digest: false,
      });
      expect(result.email_weekly_digest).toBe(false);
    });

    it('AC-19: applies the update once against the existing preferences row', async () => {
      const current = mockPreferences();
      const updated = { ...current, email_weekly_digest: false };
      mockPreferenceAction.findByUserId.mockResolvedValue(current);
      mockPreferenceAction.updateByUserId.mockResolvedValue(updated);

      const result = await service.updateNotificationPreferences(USER_ID, {
        email_weekly_digest: false,
      });

      expect(mockPreferenceAction.createDefaultForUser).not.toHaveBeenCalled();
      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledTimes(1);
      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledWith(USER_ID, {
        email_weekly_digest: false,
      });
      expect(result.email_weekly_digest).toBe(false);
    });

    it('AC-20: throws a ConflictException when the update affects no row', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);
      mockPreferenceAction.updateByUserId.mockResolvedValue(null);

      await expect(
        service.updateNotificationPreferences(USER_ID, { email_weekly_digest: false }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPreferenceAction.updateByUserId).toHaveBeenCalledTimes(1);
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
      mockNotificationAction.deleteOwnedById.mockResolvedValue(1);

      await expect(service.deleteNotification('user-1', 'notif-1')).resolves.toBeUndefined();
      expect(mockNotificationAction.deleteOwnedById).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('AC-12: throws when the notification does not exist', async () => {
      mockNotificationAction.deleteOwnedById.mockResolvedValue(0);

      await expect(service.deleteNotification('user-1', 'notif-404')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
