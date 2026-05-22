import { PinoLoggerService } from './pino-logger.service';
import { LoggerContextService } from './logger-context.service';
import { logger } from './pino.logger';

jest.mock('./pino.logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
  logLevel: 'info',
}));

describe('PinoLoggerService', () => {
  let service: PinoLoggerService;
  let contextService: LoggerContextService;

  beforeEach(() => {
    contextService = new LoggerContextService();
    service = new PinoLoggerService(contextService);
    jest.clearAllMocks();
  });

  describe('info()', () => {
    it('routes non-string input through resolveEvent', () => {
      service.info({ event: 'auth.login', userId: 'usr_123' } as unknown as string);
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'auth.login', userId: 'usr_123' }));
    });

    it('preserves Error stack when passed as message', () => {
      const err = new Error('unexpected failure');
      service.info(err as unknown as string);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'unexpected failure',
          stack: expect.stringContaining('Error: unexpected failure'),
        }),
      );
    });

    it('calls logger.info with event and data', () => {
      service.info('auth.login.success', { userId: 'usr_****1234' });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.login.success',
          userId: 'usr_****1234',
        }),
      );
    });

    it('masks email field automatically', () => {
      service.info('waitlist.joined', { email: 'alice@example.com' });
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ email: 'a****@example.com' }));
    });

    it('includes requestId from ALS context', () => {
      contextService.run({ requestId: 'req-abc' }, () => {
        service.info('auth.login.success', {});
        expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-abc' }));
      });
    });

    it('includes null requestId when in job context', () => {
      contextService.run({ requestId: null }, () => {
        service.info('funnel.job.received', {});
        expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ requestId: null }));
      });
    });

    it('masks userId from context', () => {
      contextService.run({ requestId: 'req-1', userId: 'usr_abc123def456' }, () => {
        service.info('user.updated', {});
        expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ userId: 'usr_****f456' }));
      });
    });

    it('masks sessionId from context', () => {
      contextService.run({ requestId: 'req-1', sessionId: 'sess_abc123def456' }, () => {
        service.info('auth.session.created', {});
        expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sess_****f456' }));
      });
    });
  });

  describe('warn()', () => {
    it('calls logger.warn with correct event', () => {
      service.warn('auth.login.failed', { userId: 'usr_****1234' });
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'auth.login.failed' }));
    });

    it('masks email field', () => {
      service.warn('auth.otp.invalid', { email: 'bob@example.com' });
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ email: 'b****@example.com' }));
    });

    it('routes non-string input through resolveEvent', () => {
      service.warn({ message: 'rate.limit.exceeded', count: 5 } as unknown as string);
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'rate.limit.exceeded', count: 5 }));
    });
  });

  describe('error()', () => {
    it('calls logger.error with correct event', () => {
      service.error('funnel.job.failed', { jobId: 1 });
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'funnel.job.failed' }));
    });

    it('unpacks Error object passed as third argument', () => {
      const err = new Error('something went wrong');
      service.error('funnel.write.rolled_back', {}, err);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'something went wrong',
          stack: expect.stringContaining('Error: something went wrong'),
        }),
      );
    });

    it('unpacks Error object passed inside data — extracts message and stack', () => {
      const err = new Error('db error');
      service.error('funnel.write.rolled_back', { error: err });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'db error',
          stack: expect.stringContaining('Error: db error'),
        }),
      );
    });

    it('unpacks Error passed directly as dataOrStack — preserves stack from non-enumerable props', () => {
      const err = new Error('direct error');
      service.error('funnel.write.failed', err as unknown as Record<string, unknown>);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'direct error',
          stack: expect.stringContaining('Error: direct error'),
        }),
      );
    });

    it('puts nestContext in payload when third argument is a string (NestJS convention)', () => {
      const stack = 'Error: something\n    at ...';
      service.error('http.unhandled', stack, 'ExceptionsHandler');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'http.unhandled',
          nestContext: 'ExceptionsHandler',
        }),
      );
    });

    it('does not expose raw Error object in log output', () => {
      const err = new Error('raw error');
      service.error('funnel.job.failed', {}, err);
      const call = (logger.error as jest.Mock).mock.calls[0][0];
      expect(call.error).toBe('raw error');
      expect(call.error).not.toBeInstanceOf(Error);
    });
  });

  describe('debug()', () => {
    it('calls logger.debug with event and data', () => {
      service.debug('llm.gemini.request', { prompt: 'summary' });
      expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ event: 'llm.gemini.request' }));
    });

    it('masks email in debug output', () => {
      service.debug('debug.event', { email: 'carol@example.com' });
      expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ email: 'c****@example.com' }));
    });
  });

  describe('NestJS LoggerService interface', () => {
    it('log() bridges to pino.info with nestjs.log event', () => {
      service.log('Application started', 'NestFactory');
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'nestjs.log' }));
    });

    it('verbose() bridges to pino.debug', () => {
      service.verbose('Verbose message', 'RouterExplorer');
      expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ event: 'nestjs.verbose' }));
    });

    it('fatal() bridges to pino.fatal', () => {
      service.fatal('Uncaught exception', 'Bootstrap');
      expect(logger.fatal).toHaveBeenCalledWith(expect.objectContaining({ event: 'nestjs.fatal' }));
    });
  });

  describe('resolveEvent() — non-string message routing', () => {
    it('array input produces event: unknown with raw field', () => {
      service.info(['a', 'b'] as unknown as string);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'unknown', raw: ['a', 'b'] }),
      );
    });

    it('plain object with no event or message key falls back to event: unknown', () => {
      service.info({ userId: 'usr_123' } as unknown as string);
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'unknown' }));
    });

    it('plain object uses message key when event key is absent', () => {
      service.info({ message: 'fallback.event' } as unknown as string);
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'fallback.event' }));
    });

    it('plain object strips event and message keys from data spread', () => {
      service.info({ event: 'my.event', message: 'ignore', extra: 42 } as unknown as string);
      const call = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(call.event).toBe('my.event');
      expect(call.message).toBeUndefined();
      expect(call.extra).toBe(42);
    });
  });

  describe('runWithContext()', () => {
    it('makes provided context available during callback', () => {
      service.runWithContext({ requestId: 'ctx-123' }, () => {
        service.info('test.event', {});
        expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'ctx-123' }));
      });
    });

    it('merges with existing context', () => {
      contextService.run({ requestId: 'existing' }, () => {
        service.runWithContext({ userId: 'usr_abc123' }, () => {
          const ctx = contextService.getContext();
          expect(ctx?.requestId).toBe('existing');
          expect(ctx?.userId).toBe('usr_abc123');
        });
      });
    });
  });
});