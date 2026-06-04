import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelStage } from '../../../funnels/entities/funnel-stage.entity';
import { StageStatus } from '../../../funnels/enums/stage-status.enum';
import { AdminNotificationModelAction } from '../actions/admin-notification.action';
import { AdminNotificationType } from '../enums/admin-notification.enum';
import { AdminNotificationsService } from './admin-notifications.service';

const STUCK_THRESHOLD_DAYS = 14;

interface StuckStageRow {
  stage_id: string;
  stage_name: string;
  funnel_id: string;
  user_id: string;
  user_full_name: string | null;
  user_avatar_url: string | null;
  days_stuck: number;
}

/**
 * FR-9 risk signal: a user stuck on an active stage for more than 14 days.
 * Runs daily at a quiet hour; each stuck stage alerts admins exactly once
 * (dedup on metadata.stage_id), so a stage that stays stuck does not re-alert.
 */
@Injectable()
export class AdminRiskDetectionService {
  private readonly logger = new Logger(AdminRiskDetectionService.name);

  constructor(
    @InjectRepository(FunnelStage)
    private readonly stageRepository: Repository<FunnelStage>,
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
    const stuckStages = await this.findStuckStages();
    let notified = 0;

    for (const stage of stuckStages) {
      const alreadyFlagged = await this.notificationAction.riskExistsForStage(stage.stage_id);
      if (alreadyFlagged) {
        continue;
      }

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
      notified += 1;
    }

    return notified;
  }

  /** Active stages unlocked more than 14 days ago, with their owner (deleted accounts excluded). */
  private async findStuckStages(): Promise<StuckStageRow[]> {
    const rows = await this.stageRepository
      .createQueryBuilder('stage')
      .innerJoin('stage.funnel', 'funnel')
      .innerJoin('funnel.user', 'user', 'user.deleted_at IS NULL')
      .select('stage.id', 'stage_id')
      .addSelect('stage.name', 'stage_name')
      .addSelect('funnel.id', 'funnel_id')
      .addSelect('user.id', 'user_id')
      .addSelect('user.full_name', 'user_full_name')
      .addSelect('user.avatar_url', 'user_avatar_url')
      .addSelect('FLOOR(EXTRACT(EPOCH FROM (NOW() - stage.unlocked_at)) / 86400)', 'days_stuck')
      .where('stage.status = :status', { status: StageStatus.ACTIVE })
      .andWhere('stage.unlocked_at IS NOT NULL')
      .andWhere(`stage.unlocked_at < NOW() - INTERVAL '${STUCK_THRESHOLD_DAYS} days'`)
      .getRawMany<Omit<StuckStageRow, 'days_stuck'> & { days_stuck: string }>();

    // days_stuck arrives as a string because pg returns numerics as text.
    return rows.map((row) => ({ ...row, days_stuck: Number(row.days_stuck) }));
  }
}
