import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelsModule } from '../../funnels/funnels.module';
import { RedisModule } from '../../redis/redis.module';
import { UsersModule } from '../../users/users.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminNotificationModelAction } from './actions/admin-notification.action';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { AdminNotification } from './entities/admin-notification.entity';
import { AdminNotificationListener } from './listeners/admin-notification.listener';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminRiskDetectionService } from './services/admin-risk-detection.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminNotification]),
    RedisModule,
    AdminAuthModule,
    // UsersModule provides UserRoleModelAction (admin fan-out) and UserModelAction (sender lookup);
    // FunnelsModule provides FunnelStageModelAction (risk scan).
    UsersModule,
    FunnelsModule,
  ],
  controllers: [AdminNotificationsController],
  providers: [
    AdminNotificationModelAction,
    AdminNotificationsService,
    AdminNotificationListener,
    AdminRiskDetectionService,
  ],
  exports: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
