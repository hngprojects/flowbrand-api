import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { setupSwagger } from './modules/auth/docs/auth-swagger.doc';
import { PinoLoggerService } from './common/logger/pino-logger.service';

const bootstrapLogger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  bootstrapLogger.error(
    'Unhandled promise rejection',
    reason instanceof Error ? reason.stack : String(reason),
  );
});

process.on('uncaughtException', (error) => {
  bootstrapLogger.error('Uncaught exception', error.stack);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  
  const pinoLogger = app.get(PinoLoggerService);
  app.useLogger(pinoLogger);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'auth/google', method: RequestMethod.ALL },
      { path: 'auth/google/callback', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    setupSwagger(app);
  }

  await app.listen(env.PORT);

  bootstrapLogger.log(`Application running on http://localhost:${env.PORT}`);
  if (env.SWAGGER_ENABLED) {
    bootstrapLogger.log(`Swagger docs at http://localhost:${env.PORT}/docs`);
  }
}

void bootstrap();
