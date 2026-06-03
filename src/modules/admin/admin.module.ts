import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';


@Module({
  imports: [AdminAuthModule, AdminUsersModule, AdminDashboardModule],
})
export class AdminModule {}
