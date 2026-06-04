import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FunnelStageModelAction } from '../../../funnels/actions/funnel-stage.action';
import { AdminNotificationModelAction } from '../actions/admin-notification.action';
import { AdminNotificationType } from '../enums/admin-notification.enum';
import { AdminNotificationsService } from './admin-notifications.service';

const STUCK_THRESHOLD_DAYS = 14;

/**
 * FR-9 risk signal: a user stuck on an active stage for more than 14 days.
 * Runs daily at a quiet hour; each stuck stage alerts admins exactly once
 * (dedup on metadata.stage_id), so a stage that stays stuck does not re-alert.
 */
@Injectable()
export class AdminRiskDetectionService {
  private readonly logger = new Logger(AdminRiskDetectionService.name);

  constructor(
    private readonly stageAction: FunnelStageModelAction,
    private readonly adminNotificationsService: AdminNotificationsService,
    private readonly notificationAction: AdminNotificationModelAction,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailyRiskScan(): Promise<void> {
    try {
      const notified = await this.runRiskScan();
      if (notified > 0) {
        this.logger.log({ message: 'Risk scan dispatched admin notifications', stages: notified });
      }
    } catch (err) {
      this.logger.error({ message: 'Risk scan failed', error: (err as Error).message });
    }
  }

  /** Returns the number of stuck stages that produced a new risk notification batch. */
  async runRiskScan(): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - STUCK_THRESHOLD_DAYS);

    const stuckStages = await this.stageAction.findStuckStages(threshold);
    if (stuckStages.length === 0) {
      return 0;
    }

    // One batched dedup query instead of one lookup per stuck stage.
    const alreadyFlagged = new Set(
      await this.notificationAction.riskFlaggedStageIds(stuckStages.map((stage) => stage.stage_id)),
    );
    const newStages = stuckStages.filter((stage) => !alreadyFlagged.has(stage.stage_id));

    for (const stage of newStages) {
      await this.adminNotificationsService.notifyAllAdmins(
        AdminNotificationType.RISK,
        'User stuck on a stage',
        `${stage.user_full_name ?? 'A user'} has been on the "${stage.stage_name}" stage ` +
          `for over ${STUCK_THRESHOLD_DAYS} days`,
        {
          user_id: stage.user_id,
          funnel_id: stage.funnel_id,
          stage_id: stage.stage_id,
          days_stuck: stage.days_stuck,
        },
        { sender_name: stage.user_full_name, sender_avatar_url: stage.user_avatar_url },
      );
    }

    return newStages.length;
  }
}
