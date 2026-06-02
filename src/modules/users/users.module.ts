import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelsModule } from '../funnels/funnels.module';
import { UploadModule } from '../upload/upload.module';
import { RedisModule } from '../redis/redis.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { UserModelAction } from './actions/user.action';
import { UserRoleModelAction } from './actions/user-role.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserStateService } from './user-state.service';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { AccountDeletionProcessor, ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';
import { AuthMetadata } from '../auth/entities/auth-metadata.entity';
import { AuthMetadataModelAction } from '../auth/actions/auth-metadata.action';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRoleEntity, UserSession, AuthMetadata]),
    OnboardingModule,
    FunnelsModule,
    forwardRef(() => NotificationsModule),
    RedisModule,
    UploadModule,
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
  controllers: [UsersController],
  providers: [
    UserModelAction,
    UserRoleModelAction,
    UserSessionModelAction,
    UsersService,
    UserStateService,
    AccountDeletionProcessor,
    AuthMetadataModelAction,
  ],
  exports: [UsersService, UserModelAction, UserRoleModelAction, UserSessionModelAction],
})
export class UsersModule {}
