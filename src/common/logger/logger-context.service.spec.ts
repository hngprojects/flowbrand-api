import { LoggerContextService } from './logger-context.service';

describe('LoggerContextService', () => {
  let service: LoggerContextService;

  beforeEach(() => {
    service = new LoggerContextService();
  });

  describe('getContext()', () => {
    it('returns undefined outside of a run() context', () => {
      expect(service.getContext()).toBeUndefined();
    });

    it('returns the context object inside run()', () => {
      service.run({ requestId: 'test-id' }, () => {
        expect(service.getContext()).toEqual({ requestId: 'test-id' });
      });
    });
  });

  describe('getRequestId()', () => {
    it('returns null outside of a run() context', () => {
      expect(service.getRequestId()).toBeNull();
    });

    it('returns the requestId inside run()', () => {
      service.run({ requestId: 'abc-123' }, () => {
        expect(service.getRequestId()).toBe('abc-123');
      });
    });

    it('returns null when requestId is null', () => {
      service.run({ requestId: null }, () => {
        expect(service.getRequestId()).toBeNull();
      });
    });
  });

  describe('run()', () => {
    it('isolates context between separate run() calls', () => {
      let idFromFirst: string | null = null;
      let idFromSecond: string | null = null;

      service.run({ requestId: 'first' }, () => {
        idFromFirst = service.getRequestId();
      });

      service.run({ requestId: 'second' }, () => {
        idFromSecond = service.getRequestId();
      });

      expect(idFromFirst).toBe('first');
      expect(idFromSecond).toBe('second');
    });

    it('propagates context through async boundaries', async () => {
      let resolvedId: string | null = null;

      await service.run({ requestId: 'async-id' }, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        resolvedId = service.getRequestId();
      });

      expect(resolvedId).toBe('async-id');
    });

    it('context is not accessible after run() completes', () => {
      service.run({ requestId: 'gone' }, () => {});
      expect(service.getContext()).toBeUndefined();
    });
  });

  describe('setUserId()', () => {
    it('enriches the existing context with userId', () => {
      service.run({ requestId: 'req-1' }, () => {
        service.setUserId('user-abc');
        expect(service.getContext()?.userId).toBe('user-abc');
      });
    });

    it('does nothing when called outside a run() context', () => {
      expect(() => service.setUserId('user-abc')).not.toThrow();
    });
  });

  describe('setSessionId()', () => {
    it('enriches the existing context with sessionId', () => {
      service.run({ requestId: 'req-1' }, () => {
        service.setSessionId('sess-xyz');
        expect(service.getContext()?.sessionId).toBe('sess-xyz');
      });
    });

    it('does nothing when called outside a run() context', () => {
      expect(() => service.setSessionId('sess-xyz')).not.toThrow();
    });
  });

  describe('setJobContext()', () => {
    it('enriches the existing context with job fields', () => {
      service.run({ requestId: null }, () => {
        service.setJobContext(42, 'funnel-generation', 1);
        const ctx = service.getContext();
        expect(ctx?.jobId).toBe(42);
        expect(ctx?.queue).toBe('funnel-generation');
        expect(ctx?.attempt).toBe(1);
      });
    });

    it('does nothing when called outside a run() context', () => {
      expect(() => service.setJobContext(1, 'queue')).not.toThrow();
    });
  });
});