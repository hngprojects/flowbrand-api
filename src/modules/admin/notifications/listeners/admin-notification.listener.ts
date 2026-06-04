import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_EVENTS } from '../../../../common/constants/app-events';
import { FeedbackSubmittedEvent, StageCompletedEvent } from '../../../../common/events/events';
import { UserModelAction } from '../../../users/actions/user.action';
import { AdminNotificationType } from '../enums/admin-notification.enum';
import { AdminNotificationsService } from '../services/admin-notifications.service';

/**
 * Auto-generates admin notifications from platform events (FR-9).
 * Fire-and-forget: every handler is wrapped and never rethrows, so a failure
 * here cannot affect the HTTP response of the service that emitted the event.
 */
@Injectable()
export class AdminNotificationListener {
  private readonly logger = new Logger(AdminNotificationListener.name);

  constructor(
    private readonly adminNotificationsService: AdminNotificationsService,
    private readonly userAction: UserModelAction,
  ) {}

  @OnEvent(APP_EVENTS.STAGE_COMPLETED)
  async onStageCompleted(event: StageCompletedEvent): Promise<void> {
    await this.safely('stage.completed', event.userId, async () => {
      const sender = await this.resolveSender(event.userId);

      await this.adminNotificationsService.notifyAllAdmins(
        AdminNotificationType.MILESTONE,
        'Stage milestone reached',
        `${sender.sender_name ?? 'A user'} completed the "${event.stageName}" stage`,
        {
          user_id: event.userId,
          funnel_id: event.funnelId,
          stage_id: event.stageId,
          stage_position: event.stagePosition,
        },
        sender,
      );
    });
  }

  @OnEvent(APP_EVENTS.FEEDBACK_SUBMITTED)
  async onFeedbackSubmitted(event: FeedbackSubmittedEvent): Promise<void> {
    await this.safely('feedback.submitted', event.userId, async () => {
      const sender = await this.resolveSender(event.userId);

      await this.adminNotificationsService.notifyAllAdmins(
        AdminNotificationType.FEEDBACK,
        'New stage feedback submitted',
        `${sender.sender_name ?? 'A user'} submitted feedback on a stage`,
        {
          user_id: event.userId,
          funnel_id: event.funnelId,
          stage_id: event.stageId,
          feedback_id: event.feedbackId,
        },
        sender,
      );
    });
  }

  private async resolveSender(userId: string): Promise<{ sender_name: string | null; sender_avatar_url: string | null }> {
    const user = await this.userAction.findById(userId);
    return {
      sender_name: user?.full_name ?? null,
      sender_avatar_url: user?.avatar_url ?? null,
    };
  }

  private async safely(label: string, userId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error({
        message: 'Admin notification handler failed',
        event: label,
        userId,
        error: (err as Error).message,
      });
    }
  }
}
