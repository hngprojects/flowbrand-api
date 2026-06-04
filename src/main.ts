import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
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

// Paystack webhook source IPs — secondary defence behind HMAC (SEC-06).
// IMPORTANT: verify this list against https://paystack.com/docs/payments/webhooks/#ip-whitelisting
// before every deploy. Wrong IPs here will silently block all legitimate webhooks.
const PAYSTACK_WEBHOOK_IPS = new Set(['52.31.139.75', '52.49.173.169', '52.214.14.220']);

async function bootstrap() {
  // bodyParser: false — we register our own JSON middleware below so we can attach
  // rawBody to every request. The webhook handler needs the raw bytes for HMAC-SHA512
  // verification; NestJS's default parser discards them.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const httpAdapter = app.getHttpAdapter();

  // Preserve raw bytes on every request for webhook HMAC verification (SEC-04).
  // Must be registered before any route handler sees the request body.
  httpAdapter.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  httpAdapter.use(express.urlencoded({ extended: true }));

  // Scope raw-body (Buffer) parsing to the webhook path only.
  // The webhook controller reads req.body as a Buffer for HMAC verification;
  // the global JSON middleware above has already run but the raw() middleware here
  // takes precedence for this path when bodyParser is false on NestFactory.
  httpAdapter.use('/api/payments/webhook', express.raw({ type: '*/*' }));

  // IP allowlist — reject non-Paystack source IPs before HMAC check (SEC-06).
  // HMAC is the authoritative guard; this is defence-in-depth.
  // If this list is stale at deploy time, all legitimate webhooks are rejected —
  // keep it up-to-date with Paystack's published IP ranges.
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
