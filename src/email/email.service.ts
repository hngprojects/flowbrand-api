import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { JOBS, QUEUES } from '../common/constants/queue.constants';
import { maskEmail, maskId } from '../utils/pii.utils';
import type { EmailJob, OtpPayload } from './interfaces/email-job.interface';

const DEFAULT_PRIORITY = 5;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue<EmailJob>,
  ) {}

  async sendOtpVerification(
    to: string,
    payload: OtpPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch(
      { to, type: 'otp-verification', payload, userId },
      DEFAULT_PRIORITY,
    );
  }

  async sendOtpReset(
    to: string,
    payload: OtpPayload,
    userId?: string,
  ): Promise<string | undefined> {
    return this.dispatch(
      { to, type: 'otp-reset', payload, userId },
      DEFAULT_PRIORITY,
    );
  }

  private async dispatch(
    job: EmailJob,
    priority: number,
  ): Promise<string | undefined> {
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
