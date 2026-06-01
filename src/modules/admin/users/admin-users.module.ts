import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  providers: [RolesGuard],
})
export class AdminUsersModule {}
