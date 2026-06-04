import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelStage } from '../../funnels/entities/funnel-stage.entity';
import { RedisModule } from '../../redis/redis.module';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
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
    // UserRoleEntity is registered here explicitly: the admin fan-out query must not
    // depend on another module's TypeOrmModule re-export. FunnelStage backs the risk scan.
    TypeOrmModule.forFeature([AdminNotification, UserRoleEntity, FunnelStage]),
    RedisModule,
    AdminAuthModule,
    UsersModule,
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
