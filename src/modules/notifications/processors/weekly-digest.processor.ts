import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import pLimit from 'p-limit';
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationPreferenceModelAction } from '../actions/notification-preference.action';

const PAGE_SIZE = 100;
const DISPATCH_CONCURRENCY = 10;

/**
 * Runs on the recurring JOBS.WEEKLY_DIGEST job (registered in NotificationsModule).
 * Fans out one digest email per user who has opted in via email_weekly_digest.
 *
 * Recipients are read one page at a time (never the whole table at once) and each
 * page is dispatched with bounded concurrency so a large user base cannot spike
 * memory or saturate the DB/email queue.
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
    this.logger.log({ message: 'Weekly digest started', jobId: job.id });

    const limit = pLimit(DISPATCH_CONCURRENCY);
    let offset = 0;
    let processed = 0;
    let dispatched = 0;

    for (;;) {
      const page = await this.preferenceAction.findWeeklyDigestRecipients(PAGE_SIZE, offset);
      if (page.length === 0) {
        break;
      }
      processed += page.length;

      const results = await Promise.allSettled(page.map((pref) => limit(() => this.dispatchOne(pref))));
      dispatched += results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

      if (page.length < PAGE_SIZE) {
        break;
      }
      offset += PAGE_SIZE;
    }

    this.logger.log({ message: 'Weekly digest completed', jobId: job.id, processed, dispatched });
  }

  /** Dispatches one user's digest. Swallows and logs failures so one user cannot fail the batch. */
  private async dispatchOne(pref: NotificationPreference): Promise<boolean> {
    const user = pref.user;
    if (!user?.email) {
      return false;
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
      return true;
    } catch (err) {
      this.logger.error({
        message: 'Weekly digest dispatch failed for user',
        userId: user.id,
        error: (err as Error).message,
      });
      return false;
    }
  }
}
