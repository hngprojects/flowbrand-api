import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationModelAction } from './actions/notification.action';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationModelAction, NotificationsService],
  exports: [NotificationModelAction, NotificationsService],
})
export class NotificationsModule {}
