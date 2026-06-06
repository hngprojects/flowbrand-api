import { forwardRef, Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../../email/email.module';
import { EmailQueueModule } from '../../email/email-queue.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { PaymentsModule } from '../payments/payments.module'; // Added
import { UsersModule } from '../users/users.module';
import { NotificationModelAction } from './actions/notification.action';
import { NotificationPreferenceModelAction } from './actions/notification-preference.action';
import { NotificationsController } from './controllers/notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationListener } from './listeners/notification.listener';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference]),
    EmailModule,
    EmailQueueModule,
    FunnelsModule,
    forwardRef(() => UsersModule),
    PaymentsModule, // Added
  ],
  providers: [
    NotificationModelAction,
    NotificationPreferenceModelAction,
    NotificationsService,
    NotificationListener,
    // WeeklyDigestProcessor removed
  ],
  exports: [NotificationModelAction, NotificationPreferenceModelAction, NotificationsService],
})
export class NotificationsModule {} // OnModuleInit removed
