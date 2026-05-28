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
import { AccountDeletionProcessor, ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSession]),
    OnboardingModule,
    FunnelsModule,
    RedisModule,
    BullModule.registerQueue({ name: ACCOUNT_DELETION_QUEUE }),
  ],
  controllers: [UsersController],
  providers: [
    UserModelAction, 
    UserSessionModelAction, 
    UsersService, 
    UserStateService,
    AccountDeletionProcessor,
  ],
  exports: [UsersService, UserModelAction, UserSessionModelAction],
})
export class UsersModule {}
