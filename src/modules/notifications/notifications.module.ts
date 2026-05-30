import { InjectQueue } from '@nestjs/bull';
import { forwardRef, Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { JOBS, QUEUES } from '../../common/constants/queue.constants';
import { EmailModule } from '../../email/email.module';
import { EmailQueueModule } from '../../email/email-queue.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { UsersModule } from '../users/users.module';
import { NotificationsController } from './controllers/notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationModelAction } from './actions/notification.action';
import { NotificationPreferenceModelAction } from './actions/notification-preference.action';
import { NotificationListener } from './listeners/notification.listener';
import { WeeklyDigestProcessor } from './processors/weekly-digest.processor';
import { NotificationsService } from './notifications.service';

const WEEKLY_DIGEST_CRON = '0 9 * * MON';
const WEEKLY_DIGEST_JOB_ID = 'weekly-digest-recurring';

@Module({
  controllers: [NotificationsController],
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference]),
    EmailModule,
    EmailQueueModule,
    FunnelsModule,
    forwardRef(() => UsersModule),
  ],
  providers: [
    NotificationModelAction,
    NotificationPreferenceModelAction,
    NotificationsService,
    NotificationListener,
    WeeklyDigestProcessor,
  ],
  exports: [NotificationModelAction, NotificationPreferenceModelAction, NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  private readonly logger = new Logger(NotificationsModule.name);

  constructor(@InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue) {}

  /** Registers the recurring weekly-digest job once on boot (AC-09). Repeated by jobId, so it is idempotent. */
  async onModuleInit(): Promise<void> {
    try {
      await this.emailQueue.add(
        JOBS.WEEKLY_DIGEST,
        {},
        { repeat: { cron: WEEKLY_DIGEST_CRON }, jobId: WEEKLY_DIGEST_JOB_ID },
      );
      this.logger.log('Weekly digest recurring job registered');
    } catch (err) {
      // Redis may be unavailable at boot. Do not crash the app; the job is re-added on next boot.
      this.logger.error({
        message: 'Failed to register weekly digest recurring job',
        error: (err as Error).message,
      });
    }
  }
}
