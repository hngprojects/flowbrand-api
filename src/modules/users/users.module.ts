import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModelAction } from './actions/user.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisModule } from '../redis/redis.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { UserStateService } from './user-state.service';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config'
import { AccountDeletionProcessor, ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';
import { AuthMetadata } from '../auth/entities/auth-metadata.entity';
import { AuthMetadataModelAction } from '../auth/actions/auth-metadata.action';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSession, AuthMetadata]),
    OnboardingModule,
    FunnelsModule,
    RedisModule,
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
    UserSessionModelAction, 
    UsersService, 
    UserStateService,
    AccountDeletionProcessor,
    AuthMetadataModelAction,
  ],
  exports: [UsersService, UserModelAction, UserSessionModelAction],
})
export class UsersModule {}
