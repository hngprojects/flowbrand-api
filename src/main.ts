import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { PAYSTACK_WEBHOOK_IPS } from './modules/payments/constants/paystack-webhook.constants';
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
  // bodyParser: false — we register our own JSON middleware so the verify callback
  // can attach req.rawBody for webhook HMAC-SHA512 verification (SEC-04).
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const httpAdapter = app.getHttpAdapter();

  httpAdapter.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  httpAdapter.use(express.urlencoded({ extended: true }));

  // IP allowlist — reject non-Paystack source IPs before HMAC check (SEC-06).
  // HMAC (SEC-03) is the authoritative guard; this is defence-in-depth.
  httpAdapter.use('/api/payments/webhook', (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    if (!PAYSTACK_WEBHOOK_IPS.has(ip)) {
      bootstrapLogger.warn(`Webhook request from unknown IP rejected before HMAC check: ${ip}`);
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
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
      { path: '', method: RequestMethod.GET },
      { path: 'api', method: RequestMethod.GET },
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
