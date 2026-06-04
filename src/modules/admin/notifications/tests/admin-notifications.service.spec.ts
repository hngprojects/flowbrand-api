import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminNotificationModelAction } from '../actions/admin-notification.action';
import { AdminNotification } from '../entities/admin-notification.entity';
import {
  AdminNotificationReadFilter,
  AdminNotificationType,
  AdminNotificationTypeFilter,
} from '../enums/admin-notification.enum';
import { AdminNotificationsService } from '../services/admin-notifications.service';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTIFICATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockNotificationAction = {
  listForAdminPaginated: jest.fn(),
  countUnread: jest.fn(),
  findOwnedById: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  markUnreadByIds: jest.fn(),
  markAllUnread: jest.fn(),
  deleteOwnedById: jest.fn(),
  deleteOwnedByIds: jest.fn(),
  deleteAllForAdmin: jest.fn(),
  toggleStarred: jest.fn(),
};

const notification = (overrides: Partial<AdminNotification> = {}): AdminNotification =>
  ({
    id: NOTIFICATION_ID,
    admin_id: ADMIN_ID,
    type: AdminNotificationType.MILESTONE,
    title: 'Stage milestone reached',
    message: 'Ada completed the "Build Awareness" stage',
    sender_name: 'Ada Obi',
    sender_avatar_url: null,
    is_read: false,
    is_starred: false,
    read_at: null,
    metadata: { stage_id: 'stage-1' },
    created_at: new Date('2026-06-01T10:00:00.000Z'),
    updated_at: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  }) as AdminNotification;

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        { provide: AdminNotificationModelAction, useValue: mockNotificationAction },
      ],
    }).compile();
    service = module.get<AdminNotificationsService>(AdminNotificationsService);
  });

  describe('getFeed', () => {
    it('AC-01: returns the paginated feed with total and the unfiltered unread_count', async () => {
      mockNotificationAction.listForAdminPaginated.mockResolvedValue([[notification()], 1]);
      mockNotificationAction.countUnread.mockResolvedValue(7);

      const result = await service.getFeed(ADMIN_ID, { page: 1, per_page: 20 });

      expect(result.meta).toEqual({ total: 1, unread_count: 7, page: 1, per_page: 20, has_next: false });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('admin_id');
      expect(result.data[0]).not.toHaveProperty('updated_at');
    });

    it('AC-02/AC-03/AC-04: forwards type, read and starred filters to the action layer', async () => {
      mockNotificationAction.listForAdminPaginated.mockResolvedValue([[], 0]);
      mockNotificationAction.countUnread.mockResolvedValue(0);

      await service.getFeed(ADMIN_ID, {
        type: AdminNotificationTypeFilter.RISK,
        read: AdminNotificationReadFilter.UNREAD,
        starred: true,
        page: 2,
        per_page: 10,
      });

      expect(mockNotificationAction.listForAdminPaginated).toHaveBeenCalledWith(
        ADMIN_ID,
        AdminNotificationTypeFilter.RISK,
        AdminNotificationReadFilter.UNREAD,
        true,
        2,
        10,
      );
    });

    it('AC-11: an empty feed resolves with an empty array, never an error', async () => {
      mockNotificationAction.listForAdminPaginated.mockResolvedValue([[], 0]);
      mockNotificationAction.countUnread.mockResolvedValue(0);

      const result = await service.getFeed(ADMIN_ID, {});

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('caps per_page at 50 and computes has_next from the total', async () => {
      mockNotificationAction.listForAdminPaginated.mockResolvedValue([[notification()], 120]);
      mockNotificationAction.countUnread.mockResolvedValue(0);

      const result = await service.getFeed(ADMIN_ID, { page: 1, per_page: 500 });

      expect(mockNotificationAction.listForAdminPaginated).toHaveBeenCalledWith(
        ADMIN_ID,
        AdminNotificationTypeFilter.ALL,
        AdminNotificationReadFilter.ALL,
        undefined,
        1,
        50,
      );
      expect(result.meta.per_page).toBe(50);
      expect(result.meta.has_next).toBe(true);
    });
  });

  describe('markRead', () => {
    it('AC-05: marks an owned unread notification as read in two queries', async () => {
      mockNotificationAction.findOwnedById.mockResolvedValue(notification());
      mockNotificationAction.markAsRead.mockResolvedValue(1);

      const result = await service.markRead(ADMIN_ID, NOTIFICATION_ID);

      expect(mockNotificationAction.markAsRead).toHaveBeenCalledWith(NOTIFICATION_ID, ADMIN_ID);
      expect(mockNotificationAction.findOwnedById).toHaveBeenCalledTimes(1);
      expect(result.is_read).toBe(true);
      expect(result.read_at).toBeInstanceOf(Date);
    });

    it('is idempotent for an already-read notification', async () => {
      mockNotificationAction.findOwnedById.mockResolvedValue(notification({ is_read: true }));

      const result = await service.markRead(ADMIN_ID, NOTIFICATION_ID);

      expect(mockNotificationAction.markAsRead).not.toHaveBeenCalled();
      expect(result.is_read).toBe(true);
    });

    it('SEC-01: throws 404 when the notification belongs to another admin', async () => {
      mockNotificationAction.findOwnedById.mockResolvedValue(null);

      await expect(service.markRead(ADMIN_ID, NOTIFICATION_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('AC-06/EC-02: resolves with updated_count 0 as a no-op when everything is already read', async () => {
      mockNotificationAction.markAllAsRead.mockResolvedValue(0);

      const result = await service.markAllRead(ADMIN_ID);

      expect(result).toEqual({ updated_count: 0 });
    });

    it('FR-4: forwards the optional type to the action layer', async () => {
      mockNotificationAction.markAllAsRead.mockResolvedValue(3);

      const result = await service.markAllRead(ADMIN_ID, AdminNotificationType.RISK);

      expect(mockNotificationAction.markAllAsRead).toHaveBeenCalledWith(ADMIN_ID, AdminNotificationType.RISK);
      expect(result).toEqual({ updated_count: 3 });
    });
  });

  describe('markUnread', () => {
    it('FR-8: marks the selected ids as unread, scoped to the admin', async () => {
      mockNotificationAction.markUnreadByIds.mockResolvedValue(2);

      const result = await service.markUnread(ADMIN_ID, { ids: [NOTIFICATION_ID] });

      expect(mockNotificationAction.markUnreadByIds).toHaveBeenCalledWith(ADMIN_ID, [NOTIFICATION_ID]);
      expect(result).toEqual({ updated_count: 2 });
    });

    it('FR-8: an empty ids array is a no-op returning updated_count 0', async () => {
      mockNotificationAction.markUnreadByIds.mockResolvedValue(0);

      const result = await service.markUnread(ADMIN_ID, { ids: [] });

      expect(result).toEqual({ updated_count: 0 });
    });

    it('FR-8: all: true marks every notification unread for the admin only', async () => {
      mockNotificationAction.markAllUnread.mockResolvedValue(5);

      const result = await service.markUnread(ADMIN_ID, { all: true });

      expect(mockNotificationAction.markAllUnread).toHaveBeenCalledWith(ADMIN_ID);
      expect(result).toEqual({ updated_count: 5 });
    });

    it('rejects a body that provides neither ids nor all: true', async () => {
      await expect(service.markUnread(ADMIN_ID, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteOne', () => {
    it('AC-07: deletes an owned notification', async () => {
      mockNotificationAction.deleteOwnedById.mockResolvedValue(1);

      await expect(service.deleteOne(ADMIN_ID, NOTIFICATION_ID)).resolves.toBeUndefined();
      expect(mockNotificationAction.deleteOwnedById).toHaveBeenCalledWith(NOTIFICATION_ID, ADMIN_ID);
    });

    it('SEC-01: throws 404 when the notification is not owned by the admin', async () => {
      mockNotificationAction.deleteOwnedById.mockResolvedValue(0);

      await expect(service.deleteOne(ADMIN_ID, NOTIFICATION_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkDelete', () => {
    it('AC-08/EC-03: deletes only owned ids and never errors on non-owned ids', async () => {
      mockNotificationAction.deleteOwnedByIds.mockResolvedValue(1);

      const result = await service.bulkDelete(ADMIN_ID, { ids: [NOTIFICATION_ID, OTHER_ADMIN_ID] });

      expect(mockNotificationAction.deleteOwnedByIds).toHaveBeenCalledWith(ADMIN_ID, [NOTIFICATION_ID, OTHER_ADMIN_ID]);
      expect(result).toEqual({ deleted_count: 1 });
    });

    it('SEC-02: all: true deletes through the admin-scoped path only', async () => {
      mockNotificationAction.deleteAllForAdmin.mockResolvedValue(9);

      const result = await service.bulkDelete(ADMIN_ID, { all: true });

      expect(mockNotificationAction.deleteAllForAdmin).toHaveBeenCalledWith(ADMIN_ID);
      expect(result).toEqual({ deleted_count: 9 });
    });

    it('rejects a body that provides neither ids nor all: true', async () => {
      await expect(service.bulkDelete(ADMIN_ID, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleStar', () => {
    it('AC-09: returns the atomically toggled notification (false to true)', async () => {
      mockNotificationAction.toggleStarred.mockResolvedValue(notification({ is_starred: true }));

      const result = await service.toggleStar(ADMIN_ID, NOTIFICATION_ID);

      expect(mockNotificationAction.toggleStarred).toHaveBeenCalledWith(NOTIFICATION_ID, ADMIN_ID);
      expect(result.is_starred).toBe(true);
    });

    it('AC-09: returns the atomically toggled notification (true back to false)', async () => {
      mockNotificationAction.toggleStarred.mockResolvedValue(notification({ is_starred: false }));

      const result = await service.toggleStar(ADMIN_ID, NOTIFICATION_ID);

      expect(result.is_starred).toBe(false);
    });

    it('SEC-01: throws 404 when the notification is not owned by the admin', async () => {
      mockNotificationAction.toggleStarred.mockResolvedValue(null);

      await expect(service.toggleStar(ADMIN_ID, NOTIFICATION_ID)).rejects.toThrow(NotFoundException);
    });
  });

});
