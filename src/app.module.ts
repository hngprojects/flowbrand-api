import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import './config/env';
import { jwtConfig } from './config/jwt.config';
import * as SYS_MSG from './constants/system.messages';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { RedisModule } from './modules/redis/redis.module';

function collectValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    const messages = error.constraints ? Object.values(error.constraints).map((message) => `${currentPath}: ${message}`) : [];
    const children = error.children?.length
      ? collectValidationErrors(error.children, currentPath)
      : [];

    return [...messages, ...children];
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => databaseConfig(),
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    OnboardingModule,
    RedisModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: false },
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException({
            success: false,
            statusCode: 400,
            error: 'Bad Request',
            message: SYS_MSG.VALIDATION_FAILED,
            details: collectValidationErrors(errors),
          }),
      }),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
