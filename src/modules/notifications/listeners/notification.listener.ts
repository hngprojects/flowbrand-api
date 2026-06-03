import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_EVENTS } from '../../../common/constants/app-events';
import {
  FunnelGeneratedEvent,
  NotificationsPendingEvent,
  PaymentFailedEvent,
  PlanUpgradedEvent,
  StageCompletedEvent,
  StageUnlockedEvent,
  SubscriptionCancelledEvent,
  TaskCompletedEvent,
} from '../../../common/events/events';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { UserModelAction } from '../../users/actions/user.action';
import { PaymentModelAction } from '../../payments/actions/payment.action';
import { NotificationModelAction } from '../actions/notification.action';
import { NotificationsService } from '../notifications.service';

const FUNNEL_PROGRESS_TYPE = 'funnel_progress';
const MILESTONE_THRESHOLD = 0.5;

/**
 * Reacts to APP_EVENTS by creating in-app notifications and dispatching emails,
 * each gated independently on the user's notification_preferences.
 *
 * Fire-and-forget contract (FR-7, EC-03, AC-07): every handler is wrapped in
 * try/catch and NEVER rethrows. A failure here must not affect the HTTP response
 * of the service that emitted the event.
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationAction: NotificationModelAction,
    private readonly emailService: EmailService,
    private readonly taskAction: StageTaskModelAction,
    private readonly userAction: UserModelAction,
    private readonly paymentModelAction: PaymentModelAction,
  ) {}

  @OnEvent(APP_EVENTS.STAGE_COMPLETED)
  async onStageCompleted(event: StageCompletedEvent): Promise<void> {
    await this.safely('stage.completed', event.userId, async () => {
      const prefs = await this.notificationsService.getNotificationPreferences(event.userId);

      // inapp_stage_unlocked is the single "stage events" in-app toggle: it gates
      // BOTH stage.completed and stage.unlocked. notification_preferences (M4-BE-004)
      // has no separate inapp_stage_completed column, so the two stage events share
      // this key by design, per FR-2.
      if (prefs.inapp_stage_unlocked) {
        await this.notificationsService.createNotification(
          event.userId,
          'stage_completed',
          `You completed "${event.stageName}"`,
          'Great job! You are ready for the next stage.',
          { funnelId: event.funnelId, stageId: event.stageId },
        );
      }

      if (prefs.email_stage_completed) {
        await this.email(event.userId, (to, name) =>
          this.emailService.sendStageCompleted(to, { name, stageName: event.stageName }, event.userId),
        );
      }
    });
  }

  @OnEvent(APP_EVENTS.STAGE_UNLOCKED)
  async onStageUnlocked(event: StageUnlockedEvent): Promise<void> {
    await this.safely('stage.unlocked', event.userId, async () => {
      const prefs = await this.notificationsService.getNotificationPreferences(event.userId);

      if (prefs.inapp_stage_unlocked) {
        await this.notificationsService.createNotification(
          event.userId,
          'stage_unlocked',
          `"${event.stageName}" is now active`,
          'Start engaging with your audience this week.',
          { funnelId: event.funnelId, stageId: event.stageId },
        );
      }

      if (prefs.email_stage_unlocked) {
        await this.email(event.userId, (to, name) =>
          this.emailService.sendStageUnlocked(to, { name, stageName: event.stageName }, event.userId),
        );
      }
    });
  }

  @OnEvent(APP_EVENTS.FUNNEL_GENERATED)
  async onFunnelGenerated(event: FunnelGeneratedEvent): Promise<void> {
    await this.safely('funnel.generated', event.userId, async () => {
      // System event: in-app is always created, regardless of preferences.
      // FUNNEL_GENERATED fires for first-time generation and regeneration alike,
      // so the copy is generic ("ready") rather than regeneration-specific.
      await this.notificationsService.createNotification(
        event.userId,
        'funnel_ready',
        'Your funnel is ready',
        'Your personalised plan has been created. Tap to start.',
        { funnelId: event.funnelId },
      );

      const prefs = await this.notificationsService.getNotificationPreferences(event.userId);
      if (prefs.email_funnel_ready) {
        await this.email(event.userId, (to, name) =>
          this.emailService.sendFunnelReady(to, { name, businessName: event.businessName }, event.userId),
        );
      }
    });
  }

  @OnEvent(APP_EVENTS.TASK_COMPLETED)
  async onTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    await this.safely('task.completed', event.userId, async () => {
      const prefs = await this.notificationsService.getNotificationPreferences(event.userId);
      if (!prefs.inapp_task_completed) {
        return;
      }

      const { total, complete } = await this.taskAction.getFunnelTaskProgress(event.funnelId);
      if (total === 0 || complete / total < MILESTONE_THRESHOLD) {
        return;
      }

      const alreadyNotified = await this.notificationAction.existsForFunnelType(
        event.userId,
        FUNNEL_PROGRESS_TYPE,
        event.funnelId,
      );
      if (alreadyNotified) {
        return;
      }

      await this.notificationsService.createNotification(
        event.userId,
        FUNNEL_PROGRESS_TYPE,
        'You are 50% through your funnel',
        "Keep going - you're halfway there.",
        { funnelId: event.funnelId },
      );
    });
  }

  @OnEvent(APP_EVENTS.PLAN_UPGRADED)
  async onPlanUpgraded(event: PlanUpgradedEvent): Promise<void> {
    await this.safely('plan.upgraded', event.userId, async () => {
      // EC-03: payment row may not exist if deleted between emit and handler execution
      const payment = await this.paymentModelAction.findByReference(event.reference);
      if (!payment) {
        this.logger.warn({ message: 'Payment row not found for PLAN_UPGRADED event', reference: event.reference });
        return;
      }

      // EC-04: amount 0 or null is formatted as ₦0.00 — log a warning but still send
      if (!payment.amount) {
        this.logger.warn({ message: 'Payment amount is 0 or null', reference: event.reference });
      }

      // SEC-02: only include card_last4 when it is a valid 4-digit numeric string
      const cardLast4 = /^\d{4}$/.test(payment.card_last4 ?? '') ? payment.card_last4 : null;

      await this.email(event.userId, (to, name) =>
        this.emailService.sendPaymentSuccessful(
          to,
          {
            name,
            amount: this.formatKobo(payment.amount),
            cardLast4,
            cardBrand: payment.card_brand,
            reference: event.reference,
            paidAt: this.formatDate(payment.paid_at ?? new Date()),
          },
          event.userId,
        ),
      );
    });
  }

  @OnEvent(APP_EVENTS.PAYMENT_FAILED)
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    await this.safely('payment.failed', event.userId, async () => {
      await this.email(event.userId, (to, name) =>
        this.emailService.sendPaymentFailed(to, { name, failureReason: event.failureReason }, event.userId),
      );
    });
  }

  @OnEvent(APP_EVENTS.SUBSCRIPTION_CANCELLED)
  async onSubscriptionCancelled(event: SubscriptionCancelledEvent): Promise<void> {
    await this.safely('subscription.cancelled', event.userId, async () => {
      await this.email(event.userId, (to, name) =>
        this.emailService.sendSubscriptionCancelled(
          to,
          { name, accessUntil: this.formatDate(event.accessUntil) },
          event.userId,
        ),
      );
    });
  }

  @OnEvent(APP_EVENTS.NOTIFICATIONS_PENDING)
  async onNotificationsPending(event: NotificationsPendingEvent): Promise<void> {
    await this.safely('notifications.pending', event.userId, async () => {
      const prefs = await this.notificationsService.getNotificationPreferences(event.userId);
      if (!prefs.email_weekly_digest) {
        return;
      }
      await this.email(event.userId, (to, name) =>
        this.emailService.sendNotificationAlert(to, { name, unreadCount: event.unreadCount }, event.userId),
      );
    });
  }

  /** Resolves the recipient from the trusted userId (SEC-02) and dispatches when an email exists. */
  private async email(userId: string, dispatch: (to: string, name: string) => Promise<unknown>): Promise<void> {
    const user = await this.userAction.findById(userId);
    if (!user?.email) {
      return;
    }
    await dispatch(user.email, user.full_name);
  }

  private async safely(label: string, userId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error({
        message: 'Notification handler failed',
        event: label,
        userId,
        error: (err as Error).message,
      });
    }
  }

  /** Converts a kobo integer to a formatted Naira string e.g. 1000000 → '₦10,000.00'. */
  private formatKobo(amountInKobo: number | null): string {
    const naira = (amountInKobo ?? 0) / 100;
    const formatted = naira.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `₦${formatted}`;
  }

  /** Formats a Date as 'Month D, YYYY' e.g. 'May 4, 2026'. */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
