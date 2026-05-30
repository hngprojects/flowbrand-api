import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { NotificationPreferenceModelAction } from '../actions/notification-preference.action';

/**
 * Runs on the recurring JOBS.WEEKLY_DIGEST job (registered in NotificationsModule).
 * Fans out one digest email per user who has opted in via email_weekly_digest.
 */
@Processor(QUEUES.EMAIL)
export class WeeklyDigestProcessor {
  private readonly logger = new Logger(WeeklyDigestProcessor.name);

  constructor(
    private readonly preferenceAction: NotificationPreferenceModelAction,
    private readonly taskAction: StageTaskModelAction,
    private readonly emailService: EmailService,
  ) {}

  @Process(JOBS.WEEKLY_DIGEST)
  async handleWeeklyDigest(job: Job): Promise<void> {
    const recipients = await this.preferenceAction.findWeeklyDigestRecipients();
    this.logger.log({ message: 'Weekly digest started', jobId: job.id, recipients: recipients.length });

    let dispatched = 0;
    for (const pref of recipients) {
      const user = pref.user;
      if (!user?.email) {
        continue;
      }

      try {
        const { total, complete } = await this.taskAction.getUserTaskProgress(user.id);
        await this.emailService.sendWeeklyDigest(
          user.email,
          {
            name: user.full_name,
            completedTasks: complete,
            totalTasks: total,
            activeStageName: null,
          },
          user.id,
        );
        dispatched += 1;
      } catch (err) {
        // One user's failure must not stop the rest of the batch.
        this.logger.error({
          message: 'Weekly digest dispatch failed for user',
          userId: user.id,
          error: (err as Error).message,
        });
      }
    }

    this.logger.log({ message: 'Weekly digest completed', jobId: job.id, dispatched });
  }
}
