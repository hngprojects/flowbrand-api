import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminNotificationsModule } from './notifications/admin-notifications.module';
import { AdminProfileModule } from './profile/admin-profile.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';
import { AdminSearchModule } from './search/admin-search.module';

@Module({
  imports: [
    AdminAuthModule,
    AdminUsersModule,
    AdminProfileModule,
    AdminDashboardModule,
    AdminSearchModule,
    AdminNotificationsModule,
  ],
})
export class AdminModule {}
