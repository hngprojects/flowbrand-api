import {
  OnQueueActive,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { Resend } from 'resend';
import { JOBS, QUEUES } from '../../common/constants/queue.constants';
import type { EmailJob } from '../interfaces/email-job.interface';
import { TemplateService } from '../template.service';

@Processor(QUEUES.EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly from: string;

  constructor(
    private readonly templateService: TemplateService,
    @Inject('RESEND_CLIENT') private readonly resend: Resend,
  ) {
    this.from = process.env.EMAIL_FROM ?? 'SEIL <noreply@seil.app>';
  }

  @Process(JOBS.SEND_EMAIL)
  async handleSendEmail(job: Job<EmailJob>): Promise<void> {
    const { to, type, payload, userId, requestId } = job.data;

    this.logger.log({
      message: 'Processing email job',
      jobId: job.id,
      type,
      to,
      userId,
      requestId,
      attempt: job.attemptsMade + 1,
    });

    const { html, subject } = this.templateService.render(
      type,
      payload as unknown as Record<string, unknown>,
    );

    const result = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    this.logger.log({
      message: 'Email sent successfully',
      jobId: job.id,
      type,
      to,
      resendId: result.data?.id,
    });
  }

  @OnQueueActive()
  onActive(job: Job<EmailJob>): void {
    this.logger.log({
      event: 'email_job_active',
      jobId: job.id,
      type: job.data.type,
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<EmailJob>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 3;
    const willRetry = job.attemptsMade < maxAttempts;

    this.logger.error({
      event: 'email_job_failed',
      jobId: job.id,
      type: job.data.type,
      to: job.data.to,
      userId: job.data.userId,
      attemptsMade: job.attemptsMade,
      maxAttempts,
      willRetry,
      error: error.message,
    });

    if (!willRetry) {
      this.logger.error({
        event: 'email_dead_letter',
        message: 'Email permanently failed after all retries. Manual review required.',
        jobId: job.id,
        type: job.data.type,
        to: job.data.to,
        userId: job.data.userId,
      });
    }
  }
}
