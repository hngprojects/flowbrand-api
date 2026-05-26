import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModelAction } from './actions/user.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisService } from './../redis/redis.service';
import { WizardSession } from './../onboarding/entities/wizzard-session.entity';
import { Funnel } from './../funnels/entities/funnel.entity';
import { FunnelStage } from './../funnels/entities/funnel-stage.entity';
import { StageTask } from './../funnels/entities/stage-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, 
      UserSession,
      WizardSession,
      Funnel,
      FunnelStage,
      StageTask,
    ])
  ],
  controllers: [UsersController],
  providers: [UserModelAction, UserSessionModelAction, UsersService, RedisService,],
  exports: [UsersService, UserModelAction, UserSessionModelAction],
})
export class UsersModule {}
