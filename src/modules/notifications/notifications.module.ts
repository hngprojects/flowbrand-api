import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './controllers/notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationModelAction } from './actions/notification.action';
import { NotificationPreferenceModelAction } from './actions/notification-preference.action';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationPreference])],
  providers: [NotificationModelAction, NotificationPreferenceModelAction, NotificationsService],
  exports: [NotificationModelAction, NotificationPreferenceModelAction, NotificationsService],
})
export class NotificationsModule {}
