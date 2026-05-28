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

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSession]),
    OnboardingModule,
    FunnelsModule,
    RedisModule
  ],
  controllers: [UsersController],
  providers: [
    UserModelAction, 
    UserSessionModelAction, 
    UsersService, 
    UserStateService,
  ],
  exports: [UsersService, UserModelAction, UserSessionModelAction],
})
export class UsersModule {}
