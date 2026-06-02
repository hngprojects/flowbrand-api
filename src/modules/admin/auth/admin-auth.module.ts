import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { env } from '../../../config/env';
import { EmailModule } from '../../../email/email.module';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { AuthMetadata } from '../../auth/entities/auth-metadata.entity';
import { AuthMetadataModelAction } from '../../auth/actions/auth-metadata.action';
import { RedisModule } from '../../redis/redis.module';
import { UserSession } from '../../users/entities/user-session.entity';
import { UsersModule } from '../../users/users.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSession, AuthMetadata]),
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue },
    }),
    RedisModule,
    UsersModule,
    EmailModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard, AuthMetadataModelAction],
  exports: [AdminJwtGuard, JwtModule, TypeOrmModule, RedisModule],
})
export class AdminAuthModule {}
