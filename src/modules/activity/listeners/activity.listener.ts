import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_EVENTS, AppEvent } from '../../../common/constants/app-events';
import {
  AccountDeletedEvent,
  FeedbackSubmittedEvent,
  FunnelFailedEvent,
  FunnelGeneratedEvent,
  PasswordChangedEvent,
  ProfileUpdatedEvent,
  StageCompletedEvent,
  StageUnlockedEvent,
  TaskCompletedEvent,
  TaskReopenedEvent,
  UserSignedInEvent,
  UserSignedUpEvent,
} from '../../../common/events/events';
import { ActivityEventModelAction } from '../actions/activity-event.action';

interface ActivityRow {
  user_id: string;
  event_type: AppEvent;
  funnel_id?: string | null;
  stage_id?: string | null;
  task_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Writes one append-only activity_events row per domain event.
 *
 * Listener-safety contract (CONTRIBUTING §7): every handler delegates to
 * persist(), which try/catches and NEVER rethrows. A logging failure must not
 * break the business flow that emitted the event.
 */
@Injectable()
export class ActivityListener {
  private readonly logger = new Logger(ActivityListener.name);

  constructor(private readonly activityAction: ActivityEventModelAction) {}

  @OnEvent(APP_EVENTS.FUNNEL_GENERATED)
  async onFunnelGenerated(event: FunnelGeneratedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.FUNNEL_GENERATED,
      funnel_id: event.funnelId,
      metadata: { funnelName: event.funnelName },
    });
  }

  @OnEvent(APP_EVENTS.FUNNEL_FAILED)
  async onFunnelFailed(event: FunnelFailedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.FUNNEL_FAILED,
      funnel_id: event.funnelId,
    });
  }

  @OnEvent(APP_EVENTS.STAGE_COMPLETED)
  async onStageCompleted(event: StageCompletedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.STAGE_COMPLETED,
      funnel_id: event.funnelId,
      stage_id: event.stageId,
      metadata: {
        stagePosition: event.stagePosition,
        stageName: event.stageName,
        unlockedNextStageId: event.unlockedNextStageId,
        unlockedNextStageName: event.unlockedNextStageName,
      },
    });
  }

  @OnEvent(APP_EVENTS.STAGE_UNLOCKED)
  async onStageUnlocked(event: StageUnlockedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.STAGE_UNLOCKED,
      funnel_id: event.funnelId,
      stage_id: event.stageId,
      metadata: { stagePosition: event.stagePosition, stageName: event.stageName },
    });
  }

  @OnEvent(APP_EVENTS.TASK_COMPLETED)
  async onTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.TASK_COMPLETED,
      funnel_id: event.funnelId,
      stage_id: event.stageId,
      task_id: event.taskId,
      metadata: { taskName: event.taskName },
    });
  }

  @OnEvent(APP_EVENTS.TASK_REOPENED)
  async onTaskReopened(event: TaskReopenedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.TASK_REOPENED,
      funnel_id: event.funnelId,
      stage_id: event.stageId,
      task_id: event.taskId,
      metadata: { taskName: event.taskName },
    });
  }

  @OnEvent(APP_EVENTS.FEEDBACK_SUBMITTED)
  async onFeedbackSubmitted(event: FeedbackSubmittedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.FEEDBACK_SUBMITTED,
      funnel_id: event.funnelId,
      stage_id: event.stageId,
      metadata: { feedbackId: event.feedbackId },
    });
  }

  @OnEvent(APP_EVENTS.PROFILE_UPDATED)
  async onProfileUpdated(event: ProfileUpdatedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.PROFILE_UPDATED,
      metadata: { updatedFields: [...event.updatedFields] },
    });
  }

  @OnEvent(APP_EVENTS.PASSWORD_CHANGED)
  async onPasswordChanged(event: PasswordChangedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.PASSWORD_CHANGED,
    });
  }

  @OnEvent(APP_EVENTS.ACCOUNT_DELETED)
  async onAccountDeleted(event: AccountDeletedEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.ACCOUNT_DELETED,
    });
  }

  @OnEvent(APP_EVENTS.USER_SIGNED_UP)
  async onUserSignedUp(event: UserSignedUpEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.USER_SIGNED_UP,
      metadata: { ip: event.ip, userAgent: event.userAgent },
    });
  }

  @OnEvent(APP_EVENTS.USER_SIGNED_IN)
  async onUserSignedIn(event: UserSignedInEvent): Promise<void> {
    await this.persist({
      user_id: event.userId,
      event_type: APP_EVENTS.USER_SIGNED_IN,
      metadata: { ip: event.ip, userAgent: event.userAgent },
    });
  }

  private async persist(row: ActivityRow): Promise<void> {
    try {
      await this.activityAction.create({
        createPayload: {
          user_id: row.user_id,
          event_type: row.event_type,
          funnel_id: row.funnel_id ?? null,
          stage_id: row.stage_id ?? null,
          task_id: row.task_id ?? null,
          metadata: row.metadata ?? {},
        },
        transactionOptions: { useTransaction: false },
      });
    } catch (err) {
      this.logger.error({
        message: 'Failed to write activity event',
        event_type: row.event_type,
        user_id: row.user_id,
        error: (err as Error).message,
      });
    }
  }
}
