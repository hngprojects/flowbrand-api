import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import { AdminNotificationsController } from '../controllers/admin-notifications.controller';
import { AdminNotificationType, AdminNotificationTypeFilter } from '../enums/admin-notification.enum';
import { AdminNotificationsService } from '../services/admin-notifications.service';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTIFICATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockService = {
  getFeed: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
  markUnread: jest.fn(),
  deleteOne: jest.fn(),
  bulkDelete: jest.fn(),
  toggleStar: jest.fn(),
};

describe('AdminNotificationsController', () => {
  let controller: AdminNotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [{ provide: AdminNotificationsService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminNotificationsController>(AdminNotificationsController);
  });

  it('GET /admin/notifications wraps the feed in the standard envelope', async () => {
    const feed = { data: [], meta: { total: 0, unread_count: 0, page: 1, per_page: 20, has_next: false } };
    mockService.getFeed.mockResolvedValue(feed);

    const query = { type: AdminNotificationTypeFilter.RISK, page: 1, per_page: 20 };
    const result = await controller.listNotifications(ADMIN_ID, query);

    expect(mockService.getFeed).toHaveBeenCalledWith(ADMIN_ID, query);
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATIONS_RETRIEVED,
      data: feed,
    });
  });

  it('PATCH read-all forwards the optional type filter', async () => {
    mockService.markAllRead.mockResolvedValue({ updated_count: 4 });

    const result = await controller.markAllRead(ADMIN_ID, { type: AdminNotificationType.MILESTONE });

    expect(mockService.markAllRead).toHaveBeenCalledWith(ADMIN_ID, AdminNotificationType.MILESTONE);
    expect(result.message).toBe(SYS_MSG.ADMIN_NOTIFICATIONS_MARKED_READ);
    expect(result.data).toEqual({ updated_count: 4 });
  });

  it('PATCH mark-unread forwards the selection body', async () => {
    mockService.markUnread.mockResolvedValue({ updated_count: 1 });

    const result = await controller.markUnread(ADMIN_ID, { ids: [NOTIFICATION_ID] });

    expect(mockService.markUnread).toHaveBeenCalledWith(ADMIN_ID, { ids: [NOTIFICATION_ID] });
    expect(result.message).toBe(SYS_MSG.ADMIN_NOTIFICATIONS_MARKED_UNREAD);
  });

  it('DELETE bulk forwards the selection body', async () => {
    mockService.bulkDelete.mockResolvedValue({ deleted_count: 2 });

    const result = await controller.bulkDelete(ADMIN_ID, { all: true });

    expect(mockService.bulkDelete).toHaveBeenCalledWith(ADMIN_ID, { all: true });
    expect(result.message).toBe(SYS_MSG.ADMIN_NOTIFICATIONS_BULK_DELETED);
    expect(result.data).toEqual({ deleted_count: 2 });
  });

  it('PATCH :id/read returns the updated notification', async () => {
    const item = { id: NOTIFICATION_ID, is_read: true };
    mockService.markRead.mockResolvedValue(item);

    const result = await controller.markRead(ADMIN_ID, NOTIFICATION_ID);

    expect(mockService.markRead).toHaveBeenCalledWith(ADMIN_ID, NOTIFICATION_ID);
    expect(result.message).toBe(SYS_MSG.ADMIN_NOTIFICATION_MARKED_READ);
    expect(result.data).toBe(item);
  });

  it('PATCH :id/star returns the updated notification', async () => {
    const item = { id: NOTIFICATION_ID, is_starred: true };
    mockService.toggleStar.mockResolvedValue(item);

    const result = await controller.toggleStar(ADMIN_ID, NOTIFICATION_ID);

    expect(mockService.toggleStar).toHaveBeenCalledWith(ADMIN_ID, NOTIFICATION_ID);
    expect(result.message).toBe(SYS_MSG.ADMIN_NOTIFICATION_STAR_TOGGLED);
    expect(result.data).toBe(item);
  });

  it('DELETE :id returns a null data envelope', async () => {
    mockService.deleteOne.mockResolvedValue(undefined);

    const result = await controller.deleteNotification(ADMIN_ID, NOTIFICATION_ID);

    expect(mockService.deleteOne).toHaveBeenCalledWith(ADMIN_ID, NOTIFICATION_ID);
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATION_DELETED,
      data: null,
    });
  });
});
