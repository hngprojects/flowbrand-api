import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { NotificationModelAction } from '../actions/notification.action';
import { Notification } from '../entities/notification.entity';

const mockNotificationAction = { create: jest.fn() };

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationModelAction, useValue: mockNotificationAction },
      ],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('createNotification', () => {
    it('AC-06: inserts and returns the saved notification', async () => {
      const saved = { id: 'notif-1', user_id: 'user-1', type: 'stage_completed' } as Notification;
      mockNotificationAction.create.mockResolvedValue(saved);

      const result = await service.createNotification(
        'user-1',
        'stage_completed',
        'Stage done',
        'You completed Stage 1',
      );

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
});
