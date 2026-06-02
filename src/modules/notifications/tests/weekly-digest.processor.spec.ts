import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bull';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { NotificationsPendingEvent } from '../../../common/events/events';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { NotificationModelAction } from '../actions/notification.action';
import { NotificationPreferenceModelAction } from '../actions/notification-preference.action';
import { WeeklyDigestProcessor } from '../processors/weekly-digest.processor';

const job = { id: 'job-1' } as unknown as Job;

describe('WeeklyDigestProcessor', () => {
  let processor: WeeklyDigestProcessor;

  const preferenceAction = { findWeeklyDigestRecipients: jest.fn() };
  const taskAction = { getUserTaskProgress: jest.fn() };
  const emailService = { sendWeeklyDigest: jest.fn() };
  const notificationAction = { countUnread: jest.fn() };
  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    emailService.sendWeeklyDigest.mockResolvedValue('queued');
    notificationAction.countUnread.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyDigestProcessor,
        { provide: NotificationPreferenceModelAction, useValue: preferenceAction },
        { provide: StageTaskModelAction, useValue: taskAction },
        { provide: EmailService, useValue: emailService },
        { provide: NotificationModelAction, useValue: notificationAction },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    processor = module.get(WeeklyDigestProcessor);
  });

  describe('handleWeeklyDigest', () => {
    it('AC-01: dispatches one digest per opted-in user with their task progress', async () => {
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: 'ada@seil.app', full_name: 'Ada' } },
      ]);
      taskAction.getUserTaskProgress.mockResolvedValue({ total: 6, complete: 3 });

      await processor.handleWeeklyDigest(job);

      expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith(
        'ada@seil.app',
        { name: 'Ada', completedTasks: 3, totalTasks: 6, activeStageName: null },
        'user-1',
      );
    });

    it('AC-02: skips recipients whose user record has no email', async () => {
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: null, full_name: 'NoEmail' } },
      ]);

      await processor.handleWeeklyDigest(job);

      expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
      expect(taskAction.getUserTaskProgress).not.toHaveBeenCalled();
    });

    it('AC-03: one user failure does not stop the rest of the batch', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: 'one@seil.app', full_name: 'One' } },
        { user: { id: 'user-2', email: 'two@seil.app', full_name: 'Two' } },
      ]);
      taskAction.getUserTaskProgress
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ total: 2, complete: 1 });

      await expect(processor.handleWeeklyDigest(job)).resolves.toBeUndefined();

      expect(emailService.sendWeeklyDigest).toHaveBeenCalledTimes(1);
      expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith(
        'two@seil.app',
        { name: 'Two', completedTasks: 1, totalTasks: 2, activeStageName: null },
        'user-2',
      );
      expect(loggerSpy).toHaveBeenCalled();

      loggerSpy.mockRestore();
    });

    it('AC-04: emits NOTIFICATIONS_PENDING for users with unread notifications', async () => {
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: 'ada@seil.app', full_name: 'Ada' } },
      ]);
      taskAction.getUserTaskProgress.mockResolvedValue({ total: 4, complete: 2 });
      notificationAction.countUnread.mockResolvedValue(3);

      await processor.handleWeeklyDigest(job);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.NOTIFICATIONS_PENDING,
        new NotificationsPendingEvent('user-1', 3),
      );
    });

    it('AC-05: does not emit NOTIFICATIONS_PENDING when unread count is 0', async () => {
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: 'ada@seil.app', full_name: 'Ada' } },
      ]);
      taskAction.getUserTaskProgress.mockResolvedValue({ total: 4, complete: 4 });
      notificationAction.countUnread.mockResolvedValue(0);

      await processor.handleWeeklyDigest(job);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('EC-01: notification count failure is caught and does not affect digest dispatch result', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: 'ada@seil.app', full_name: 'Ada' } },
      ]);
      taskAction.getUserTaskProgress.mockResolvedValue({ total: 2, complete: 1 });
      notificationAction.countUnread.mockRejectedValue(new Error('db timeout'));

      await expect(processor.handleWeeklyDigest(job)).resolves.toBeUndefined();

      expect(emailService.sendWeeklyDigest).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalled();

      loggerSpy.mockRestore();
    });

    it('EC-02: weekly digest failure does not prevent notification pending check from running', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
        { user: { id: 'user-1', email: 'ada@seil.app', full_name: 'Ada' } },
      ]);
      taskAction.getUserTaskProgress.mockRejectedValue(new Error('task query failed'));
      notificationAction.countUnread.mockResolvedValue(5);

      await expect(processor.handleWeeklyDigest(job)).resolves.toBeUndefined();

      expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
      expect(notificationAction.countUnread).toHaveBeenCalledWith('user-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.NOTIFICATIONS_PENDING,
        new NotificationsPendingEvent('user-1', 5),
      );

      loggerSpy.mockRestore();
    });
  });
});
