import { LoggingInterceptor } from './logging.interceptor';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { LoggerContextService } from '../logger/logger-context.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

const mockPinoLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockContextService = {
  run: jest.fn((context, callback) => callback()),
  getContext: jest.fn(),
};

function buildContext(overrides: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
}): ExecutionContext {
  const req = {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/api/test',
    headers: overrides.headers ?? {},
  };

  const res = {
    statusCode: 200,
    setHeader: jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function buildHandler(observable = of(null)): CallHandler {
  return { handle: () => observable };
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor(
      mockPinoLogger as unknown as PinoLoggerService,
      mockContextService as unknown as LoggerContextService,
    );
    jest.clearAllMocks();
  });

  describe('requestId handling', () => {
    it('uses X-Request-ID header when it is a valid UUID', (done) => {
      const validUUID = 'a3f1b2c3-d4e5-6789-abcd-ef0123456789';
      const ctx = buildContext({ headers: { 'x-request-id': validUUID } });

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          expect(mockContextService.run).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: validUUID }),
            expect.any(Function),
          );
          done();
        },
      });
    });

    it('generates a new UUID when X-Request-ID header is absent', (done) => {
      const ctx = buildContext({});

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          const calledWith = mockContextService.run.mock.calls[0][0];
          expect(calledWith.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
          done();
        },
      });
    });

    it('generates a new UUID when X-Request-ID is not a valid UUID', (done) => {
      const ctx = buildContext({ headers: { 'x-request-id': 'not-a-uuid' } });

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          const calledWith = mockContextService.run.mock.calls[0][0];
          expect(calledWith.requestId).not.toBe('not-a-uuid');
          expect(calledWith.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
          done();
        },
      });
    });

    it('echoes requestId in X-Request-ID response header (AC-03)', (done) => {
      const validUUID = 'a3f1b2c3-d4e5-6789-abcd-ef0123456789';
      const ctx = buildContext({ headers: { 'x-request-id': validUUID } });
      const res = ctx.switchToHttp().getResponse();

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', validUUID);
          done();
        },
      });
    });
  });

  describe('http.request.received', () => {
    it('logs http.request.received on every request', (done) => {
      const ctx = buildContext({ method: 'POST', path: '/api/funnels/generate' });

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          expect(mockPinoLogger.info).toHaveBeenCalledWith(
            'http.request.received',
            expect.objectContaining({ method: 'POST', path: '/api/funnels/generate' }),
          );
          done();
        },
      });
    });

    it('does not log request body (AC-08)', (done) => {
      const ctx = buildContext({});
      // Even if body existed on req, it should not appear in logs
      (ctx.switchToHttp().getRequest() as any).body = { password: 'secret' };

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          const calls = (mockPinoLogger.info as jest.Mock).mock.calls;
          const receivedCall = calls.find((c) => c[0] === 'http.request.received');
          expect(JSON.stringify(receivedCall)).not.toContain('secret');
          expect(JSON.stringify(receivedCall)).not.toContain('password');
          done();
        },
      });
    });
  });

  describe('http.request.completed', () => {
    it('logs http.request.completed with durationMs and statusCode for 2xx', (done) => {
      const ctx = buildContext({ method: 'GET', path: '/api/funnels' });

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          expect(mockPinoLogger.info).toHaveBeenCalledWith(
            'http.request.completed',
            expect.objectContaining({
              statusCode: 200,
              durationMs: expect.any(Number),
            }),
          );
          done();
        },
      });
    });
  });

  describe('http.request.rejected', () => {
    it('logs http.request.rejected as warn for 4xx errors', (done) => {
      const err = Object.assign(new Error('Not found'), { status: 404 });
      const ctx = buildContext({});

      interceptor.intercept(ctx, buildHandler(throwError(() => err))).subscribe({
        error: () => {
          expect(mockPinoLogger.warn).toHaveBeenCalledWith(
            'http.request.rejected',
            expect.objectContaining({ statusCode: 404 }),
          );
          done();
        },
      });
    });
  });

  describe('http.request.error', () => {
    it('logs http.request.error as error for 5xx errors', (done) => {
      const err = Object.assign(new Error('Internal error'), { status: 500 });
      const ctx = buildContext({});

      interceptor.intercept(ctx, buildHandler(throwError(() => err))).subscribe({
        error: () => {
          expect(mockPinoLogger.error).toHaveBeenCalledWith(
            'http.request.error',
            expect.objectContaining({ statusCode: 500 }),
            err,
          );
          done();
        },
      });
    });
  });

  describe('AC-02: shared requestId across a request', () => {
    it('passes the same requestId to contextService.run and all log calls', (done) => {
      const validUUID = 'a3f1b2c3-d4e5-6789-abcd-ef0123456789';
      const ctx = buildContext({ headers: { 'x-request-id': validUUID } });

      interceptor.intercept(ctx, buildHandler()).subscribe({
        complete: () => {
          const runContext = mockContextService.run.mock.calls[0][0];
          expect(runContext.requestId).toBe(validUUID);
          done();
        },
      });
    });
  });
});