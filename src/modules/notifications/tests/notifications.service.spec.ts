import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { NotificationModelAction } from '../actions/notification.action';
import { Notification } from '../entities/notification.entity';
import { NotificationPreferenceModelAction } from '../actions/notification-preference.action';
import { NotificationPreference } from '../entities/notification-preference.entity';

const mockNotificationAction = { create: jest.fn() };
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

  describe('notification preferences', () => {
    it('AC-01: returns current preferences for authenticated user', async () => {
      const existing = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(existing);

      const result = await service.getNotificationPreferences(USER_ID);

      expect(mockPreferenceAction.findByUserId).toHaveBeenCalledWith(USER_ID);
      expect(mockPreferenceAction.createDefaultForUser).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('AC-02: creates default preferences when no record exists', async () => {
      const created = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(null);
      mockPreferenceAction.createDefaultForUser.mockResolvedValue(created);

      const result = await service.getNotificationPreferences(USER_ID);

      expect(mockPreferenceAction.createDefaultForUser).toHaveBeenCalledWith(USER_ID);
      expect(result).toBe(created);
    });

    it('AC-03: updates email_weekly_digest and returns updated preferences', async () => {
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

    it('AC-04: updates only inapp_stage_unlocked when provided', async () => {
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

    it('AC-05: empty body returns current preferences without DB write', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);

      const result = await service.updateNotificationPreferences(USER_ID, {});

      expect(mockPreferenceAction.updateByUserId).not.toHaveBeenCalled();
      expect(result).toBe(current);
    });

    it('AC-06: unknown fields are ignored by service-level payload filtering', async () => {
      const current = mockPreferences();
      mockPreferenceAction.findByUserId.mockResolvedValue(current);

      const result = await service.updateNotificationPreferences(USER_ID, {
        unknown_flag: false,
      } as never);

      expect(mockPreferenceAction.updateByUserId).not.toHaveBeenCalled();
      expect(result).toBe(current);
    });
  });
});
