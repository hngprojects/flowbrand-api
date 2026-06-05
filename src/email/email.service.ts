import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { JOBS, QUEUES } from '../common/constants/queue.constants';
import { maskEmail, maskId } from '../utils/pii.utils';
import type {
  EmailJob,
  OtpPayload,
  WaitlistPayload,
  ContactConfirmationPayload,
  ContactAdminNotificationPayload,
  FunnelReadyPayload,
  StageUnlockedPayload,
  StageCompletedPayload,
  WeeklyDigestPayload,
  TeamInvitePayload,
} from './interfaces/email-job.interface';

const DEFAULT_PRIORITY = 5;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue<EmailJob>) {}

  async sendOtpVerification(to: string, payload: OtpPayload, userId?: string): Promise<string | undefined> {
    return this.dispatch({ to, type: 'otp-verification', payload, userId }, DEFAULT_PRIORITY);
  }

  async sendOtpReset(to: string, payload: OtpPayload, userId?: string): Promise<string | undefined> {
    return this.dispatch({ to, type: 'otp-reset', payload, userId }, DEFAULT_PRIORITY);
  }

  async sendPasswordReset(
    to: string,
    payload: OtpPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch(
      { to, type: 'password-reset', payload, userId },
      DEFAULT_PRIORITY,
    );
  }
  
  async sendWaitlistConfirmation(
     to: string, 
     payload: WaitlistPayload
   ): Promise<string | undefined> {
    return this.dispatch(
      { to, type: 'waitlist', payload }, 
      DEFAULT_PRIORITY
    );
  }

  async sendContactConfirmation(
    to: string, 
    payload: ContactConfirmationPayload
   ): Promise<string | undefined> {
    return this.dispatch(
      { to, type: 'contact-confirmation', payload }, 
      DEFAULT_PRIORITY
    );
  }

  async sendContactAdminNotification(
    to: string,
    payload: ContactAdminNotificationPayload,
  ): Promise<string | undefined> {
    return this.dispatch(
      { to, type: 'contact-admin-notification', payload }, 
      DEFAULT_PRIORITY
    );
  }

  async sendFunnelReady(
    to: string,
    payload: FunnelReadyPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch({ to, type: 'funnel-ready', payload, userId }, DEFAULT_PRIORITY);
  }

  async sendStageUnlocked(
    to: string,
    payload: StageUnlockedPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch({ to, type: 'stage-unlocked', payload, userId }, DEFAULT_PRIORITY);
  }

  async sendStageCompleted(
    to: string,
    payload: StageCompletedPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch({ to, type: 'stage-completed', payload, userId }, DEFAULT_PRIORITY);
  }

  async sendWeeklyDigest(
    to: string,
    payload: WeeklyDigestPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch({ to, type: 'weekly-digest', payload, userId }, DEFAULT_PRIORITY);
  }

  async sendTeamInvite(
    to: string,
    payload: TeamInvitePayload,
    userId?: string
  ): Promise<string | undefined> {
    return this.dispatch({ to, type: 'team-invite', payload, userId }, DEFAULT_PRIORITY);
  }

  private async dispatch(job: EmailJob, priority: number): Promise<string | undefined> {
    try {
      const queued = await this.emailQueue.add(JOBS.SEND_EMAIL, job, {
        priority,
      });

      this.logger.log({
        message: 'Email job queued',
        jobId: queued.id,
        type: job.type,
        to: maskEmail(job.to),
        userId: maskId(job.userId),
      });

      return String(queued.id);
    } catch (err) {
      this.logger.error({
        message: 'Failed to queue email — Redis may be unavailable',
        type: job.type,
        to: maskEmail(job.to),
        error: (err as Error).message,
      });
      return undefined;
    }
  }
}
