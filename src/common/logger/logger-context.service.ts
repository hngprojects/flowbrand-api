import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId: string | null;
  userId?: string;
  sessionId?: string;
  jobId?: string | number;
  queue?: string;
  attempt?: number;
}

@Injectable() 
export class LoggerContextService {
  private readonly als = new AsyncLocalStorage<LogContext>();

  run<T>(context: LogContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(context, callback)
  }

  getContext(): LogContext | undefined {
    return this.als.getStore();
  }

  getRequestId(): string | null {
    return this.getContext()?.requestId ?? null;
  }

  setUserId(userId: string): void {
    const context = this.getContext();
    if (context) {
      context.userId = userId;
    }
  }

  setSessionId(sessionId: string): void {
    const context = this.getContext();
    if (context) {
      context.sessionId = sessionId;
    }
  }

  setJobContext(jobId: string | number, queue: string, attempt?: number): void {
    const context = this.getContext();
    if (context) {
      context.jobId = jobId;
      context.queue = queue;
      context.attempt = attempt;
    }
  }
}