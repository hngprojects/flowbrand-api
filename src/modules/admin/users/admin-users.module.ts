import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UsersModule } from '../../users/users.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminUsersListAction } from './actions/admin-users-list.action';
import { AdminUserDetailAction } from './actions/admin-user-detail.action';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { LogService } from '../profile/services/log.service';

@Module({
  imports: [
    AdminAuthModule, 
    UsersModule,
  ],
  controllers: [AdminUsersController],
  providers: [
    AdminUsersService, 
    AdminUsersListAction, 
    AdminUserDetailAction, 
    RolesGuard, 
    LogService
  ],
})
export class AdminUsersModule {}
