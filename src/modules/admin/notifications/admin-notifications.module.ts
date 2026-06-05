import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../redis/redis.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminNotificationModelAction } from './actions/admin-notification.action';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { AdminNotification } from './entities/admin-notification.entity';
import { AdminNotificationsService } from './services/admin-notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminNotification]), RedisModule, AdminAuthModule],
  controllers: [AdminNotificationsController],
  providers: [AdminNotificationModelAction, AdminNotificationsService],
  exports: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
