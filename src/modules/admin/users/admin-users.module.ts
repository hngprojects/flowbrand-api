import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UsersModule } from '../../users/users.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminUsersListAction } from './actions/admin-users-list.action';
import { AdminUserDetailAction } from './actions/admin-user-detail.action';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { ACCOUNT_DELETION_QUEUE } from '../../users/processors/account-deletion.processor';
import { LogService } from '../profile/services/log.service';

@Module({
  imports: [
    AdminAuthModule, 
    UsersModule,
    BullModule.registerQueueAsync({
      name: ACCOUNT_DELETION_QUEUE,
      useFactory: (configService: ConfigService) => ({
        defaultJobOptions: {
          attempts: configService.get<number>('QUEUE_MAX_ATTEMPTS') ?? 3,
          backoff: {
            type: 'exponential',
            delay: configService.get<number>('QUEUE_BACKOFF_DELAY') ?? 5000,
          },
          removeOnComplete: {
            age: 7 * 24 * 3600,
            count: 500,
          },
          removeOnFail: {
            age: 30 * 24 * 3600,
          },
        },
      }),
      inject: [ConfigService],
    }),
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
