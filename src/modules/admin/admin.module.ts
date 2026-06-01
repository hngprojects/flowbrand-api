import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [AdminAuthModule, AdminUsersModule],
})
export class AdminModule {}
