import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModelAction } from './actions/user.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisService } from './../redis/redis.service';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { FunnelsModule } from '../funnels/funnels.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSession]),
    OnboardingModule,
    FunnelsModule
  ],
  controllers: [UsersController],
  providers: [UserModelAction, UserSessionModelAction, UsersService, RedisService,],
  exports: [UsersService, UserModelAction, UserSessionModelAction],
})
export class UsersModule {}
