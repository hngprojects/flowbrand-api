import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { LoggerContextService } from '../logger/logger-context.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly pinoLogger: PinoLoggerService,
    private readonly contextService: LoggerContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const incomingId = req.headers['x-request-id'] as string | undefined;
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incomingId ?? '');
    const requestId = incomingId && isValidUUID ? incomingId : randomUUID();

    res.setHeader('X-Request-ID', requestId);

    const method = req.method;
    const path = req.path;
    const startTime = Date.now();

    return new Observable((subscriber) => {
      void this.contextService.run({ requestId }, () => {
        this.pinoLogger.info('http.request.received', {
          method,
          path,
          userAgent: req.headers['user-agent'],
        });

        next
          .handle()
          .pipe(
            tap({
              next: () => {
                const durationMs = Date.now() - startTime;
                const statusCode = res.statusCode;

                if (statusCode >= 500) {
                  this.pinoLogger.error('http.request.error', {
                    method,
                    path,
                    statusCode,
                    durationMs,
                  });
                } else if (statusCode >= 400) {
                  this.pinoLogger.warn('http.request.rejected', {
                    method,
                    path,
                    statusCode,
                    durationMs,
                  });
                } else {
                  this.pinoLogger.info('http.request.completed', {
                    method,
                    path,
                    statusCode,
                    durationMs,
                  });
                }
              },
              error: (err: Error & { status?: number }) => {
                const durationMs = Date.now() - startTime;
                const statusCode = err.status ?? 500;

                if (statusCode >= 500) {
                  this.pinoLogger.error(
                    'http.request.error',
                    {
                      method,
                      path,
                      statusCode,
                      durationMs,
                    },
                    err,
                  );
                } else {
                  this.pinoLogger.warn('http.request.rejected', {
                    method,
                    path,
                    statusCode,
                    durationMs,
                    error: err.message,
                  });
                }
              },
            }),
          )
          .subscribe(subscriber);
      });
    });
  }
}