import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminProfileModule } from './profile/admin-profile.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';


@Module({
  imports: [AdminAuthModule, AdminUsersModule, AdminProfileModule, AdminDashboardModule],
})
export class AdminModule {}
