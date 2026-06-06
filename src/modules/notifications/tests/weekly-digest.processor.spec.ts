import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { NotificationPreferenceModelAction } from '../actions/notification-preference.action';
import { WeeklyDigestProcessor } from '../processors/weekly-digest.processor';

const job = { id: 'job-1' } as unknown as Job;

describe('WeeklyDigestProcessor', () => {
  let processor: WeeklyDigestProcessor;

  const preferenceAction = { findWeeklyDigestRecipients: jest.fn() };
  const taskAction = { getUserTaskProgress: jest.fn() };
  const emailService = { sendWeeklyDigest: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    emailService.sendWeeklyDigest.mockResolvedValue('queued');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyDigestProcessor,
        { provide: NotificationPreferenceModelAction, useValue: preferenceAction },
        { provide: StageTaskModelAction, useValue: taskAction },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    processor = module.get(WeeklyDigestProcessor);
  });

  it('dispatches one digest per opted-in user with their task progress', async () => {
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

  it('skips recipients whose user record has no email', async () => {
    preferenceAction.findWeeklyDigestRecipients.mockResolvedValue([
      { user: { id: 'user-1', email: null, full_name: 'NoEmail' } },
    ]);

    await processor.handleWeeklyDigest(job);

    expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
    expect(taskAction.getUserTaskProgress).not.toHaveBeenCalled();
  });

  it("does not let one user's failure stop the rest of the batch", async () => {
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
});
