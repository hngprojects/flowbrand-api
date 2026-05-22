import { Injectable, LoggerService } from '@nestjs/common';
import { logger, logLevel } from './pino.logger';
import { LoggerContextService } from './logger-context.service';
import { maskId, maskEmail, maskSessionId } from './pii';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger = logger;
  private readonly logLevel = logLevel;

  constructor(private readonly contextService: LoggerContextService) {}

  getLoggerLevel(): string {
    return this.logLevel;
  }

  runWithContext(
    context: Partial<{
      requestId: string | null;
      userId?: string;
      sessionId?: string;
      jobId?: string | number;
      attempt?: number;
    }>,
    callback: () => void | Promise<void>,
  ): Promise<void> {
    const existingContext = this.contextService.getContext() ?? {};
    const mergedContext = { requestId: null, ...existingContext, ...context };

    return this.contextService.run(mergedContext, async () => {
      await callback();
    });
  }

  private getContextFields(): Record<string, unknown> {
    const context = this.contextService.getContext();
    if (!context) return {};

    const fields: Record<string, unknown> = {};

    if (context.requestId !== undefined) fields.requestId = context.requestId;

    if (context.userId) fields.userId = maskId(context.userId, 'usr');
    if (context.sessionId) fields.sessionId = maskSessionId(context.sessionId);

    if (context.jobId !== undefined) fields.jobId = context.jobId;
    if (context.queue) fields.queue = context.queue;
    if (context.attempt !== undefined) fields.attempt = context.attempt;

    return fields;
  }

  private buildPayload(event: string, data?: Record<string, unknown>, err?: Error): Record<string, unknown> {
    const fields = this.getContextFields();
    const maskedData = { ...data };

    if (maskedData.email && typeof maskedData.email === 'string') {
      maskedData.email = maskEmail(maskedData.email);
    }

    if (err instanceof Error) {
      maskedData.error = err.message;
      maskedData.stack = err.stack;
    } else if (maskedData.error instanceof Error) {
      maskedData.stack = maskedData.error.stack;
      maskedData.error = maskedData.error.message;
    }
    return { event, ...fields, ...maskedData };
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.logger.info(this.buildPayload(event, data));
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.logger.warn(this.buildPayload(event, data));
  }

  error(event: string, data?: Record<string, unknown>, err?: Error): void {
    this.logger.error(this.buildPayload(event, data, err));
  }

  debug(event: string, data?: Record<string, unknown>): void {
    this.logger.debug(this.buildPayload(event, data));
  }

  log(message: string, ...optionalParams: any[]): void {
    const context = (optionalParams[0] as string | undefined) ?? 'NestJS';
    this.logger.info(this.buildPayload('nestjs.log', { message: String(message), context }));
  }

  verbose(message: string, ...optionalParams: any[]): void {
    const context = (optionalParams[0] as string | undefined) ?? 'NestJS';
    this.logger.debug(this.buildPayload('nestjs.verbose', { message: String(message), context }));
  }

  fatal(message: string, ...optionalParams: any[]): void {
    const context = (optionalParams[0] as string | undefined) ?? 'NestJS';
    this.logger.fatal(this.buildPayload('nestjs.fatal', { message: String(message), context }));
  }
}