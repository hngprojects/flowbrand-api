import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminProfileModule } from './profile/admin-profile.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';
import { AdminSearchModule } from './search/admin-search.module';import { AdminTeamsModule } from './teams/admin-teams.module';


@Module({
  imports: [AdminAuthModule, AdminUsersModule, AdminProfileModule, AdminDashboardModule, AdminSearchModule, AdminTeamsModule],
})
export class AdminModule {}
