import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminProfileModule } from './profile/admin-profile.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [AdminAuthModule, AdminUsersModule, AdminProfileModule],
})
export class AdminModule {}
