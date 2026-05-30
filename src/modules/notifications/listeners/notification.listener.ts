import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_EVENTS } from '../../../common/constants/app-events';
import {
  FunnelGeneratedEvent,
  StageCompletedEvent,
  StageUnlockedEvent,
  TaskCompletedEvent,
} from '../../../common/events/events';
import { EmailService } from '../../../email/email.service';
import { StageTaskModelAction } from '../../funnels/actions/stage-task.action';
import { UserModelAction } from '../../users/actions/user.action';
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
  ) {}

  @OnEvent(APP_EVENTS.STAGE_COMPLETED)
  async onStageCompleted(event: StageCompletedEvent): Promise<void> {
    await this.safely('stage.completed', event.userId, async () => {
      const prefs = await this.notificationsService.getNotificationPreferences(event.userId);

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
      await this.notificationsService.createNotification(
        event.userId,
        'funnel_regenerated',
        'Your funnel was regenerated',
        'Your plan has been updated based on your inputs.',
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

  /** Resolves the recipient from the trusted userId (SEC-02) and dispatches when an email exists. */
  private async email(
    userId: string,
    dispatch: (to: string, name: string) => Promise<unknown>,
  ): Promise<void> {
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
}
