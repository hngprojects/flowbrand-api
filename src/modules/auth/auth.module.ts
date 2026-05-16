import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { env } from '../../config/env';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { GoogleStrategy } from './strategies/google.strategy';
import { UserSession } from '../users/entities/user-session.entity';
import { AuthMetadata } from './entities/auth-metadata.entity';
import { AuthMetadataModelAction } from './actions/auth-metadata.action';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([User, UserSession, AuthMetadata]),
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue },
    }),
    RedisModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, AuthMetadataModelAction],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
