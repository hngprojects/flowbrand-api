import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UsersModule } from '../../users/users.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AdminAuthModule, UsersModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, RolesGuard],
})
export class AdminUsersModule {}
