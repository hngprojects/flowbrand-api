import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModelAction } from './actions/user.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSession]), RedisModule],
  controllers: [UsersController],
  providers: [UserModelAction, UserSessionModelAction, UsersService],
  exports: [UsersService, UserModelAction, UserSessionModelAction],
})
export class UsersModule {}
