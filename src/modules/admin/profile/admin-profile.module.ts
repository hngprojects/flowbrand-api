import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UsersModule } from '../../users/users.module';
import { User } from '../../users/entities/user.entity';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminProfileModelAction } from './actions/admin-profile.action';
import { AdminNotificationPreferenceModelAction } from './actions/admin-notification-preference.action';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';
import { AdminNotificationPreference } from './entities/admin-notification-preference.entity';
import { LogService } from './services/log.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, AdminNotificationPreference]), AdminAuthModule, UsersModule],
  controllers: [AdminProfileController],
  providers: [AdminProfileService, AdminProfileModelAction, AdminNotificationPreferenceModelAction, RolesGuard, LogService],
  exports: [AdminNotificationPreferenceModelAction],
})
export class AdminProfileModule {}
