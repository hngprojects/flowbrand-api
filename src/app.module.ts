import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { emailConfig } from './config/email.config';
import { env } from './config/env';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';
import * as SYS_MSG from './constants/system.messages';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { UploadModule } from './modules/upload/upload.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { RedisModule } from './modules/redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { EmailModule } from './email/email.module';
import { FunnelsModule } from './modules/funnels/funnels.module';
import { FunnelGenerationQueueModule } from './queue/funnel-generation-queue.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { ContactModule } from './modules/contact/contact.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ActivityModule } from './modules/activity/activity.module';
import { LoggerModule } from './common/logger/logger.module';
import { llmConfig } from './config/llm.config';
import { AppController } from './app.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './modules/tasks/tasks.module';
import { AdminModule } from './modules/admin/admin.module';
import { LastActiveMiddleware } from './common/middleware/last-active.middleware';

function collectValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
  return errors.flatMap((error) => {
    const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    const messages = error.constraints
      ? Object.values(error.constraints).map((message) => `${currentPath}: ${message}`)
      : [];
    const children = error.children?.length ? collectValidationErrors(error.children, currentPath) : [];

    return [...messages, ...children];
  });
}

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, llmConfig, emailConfig],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      global: true,
      maxListeners: 20,
      // true in production — listener bugs degrade silently rather than killing user requests.
      // false in dev/test — surfaces Rule 2 violations (see CONTRIBUTING.md §7) immediately.
      ignoreErrors: env.NODE_ENV === 'production',
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => databaseConfig(),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    HealthModule,
    UsersModule,
    AuthModule,
    OnboardingModule,
    FunnelsModule,
    UploadModule,
    RedisModule,
    QueueModule,
    EmailModule,
    FunnelGenerationQueueModule,
    FunnelsModule,
    WaitlistModule,
    ContactModule,
    NotificationsModule,
    ActivityModule,
    TasksModule,
    AdminModule,
  ],
  controllers: [AppController],
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
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LastActiveMiddleware).forRoutes('*');
  }
}
