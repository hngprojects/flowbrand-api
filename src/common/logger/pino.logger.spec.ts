import { Writable } from 'stream';
import pino from 'pino';
import { REDACTED_PATHS } from './pino.logger';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString().trim());
      cb();
    },
  });

  const instance = pino(
    {
      level: 'debug',
      base: { service: 'flowbrand-api', env: 'test' },
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      formatters: { level: (label) => ({ level: label }), bindings: (b) => ({ service: b['service'], env: b['env'] }) },
      timestamp: false,
    },
    stream,
  );

  return {
    instance,
    lastLine: (): Record<string, unknown> => JSON.parse(lines[lines.length - 1]),
  };
}

describe('pino logger configuration', () => {
  describe('REDACTED_PATHS — sensitive fields are censored', () => {
    it('redacts top-level password', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ password: 'secret123' }, 'test');
      expect(lastLine().password).toBe('[REDACTED]');
    });

    it('redacts nested token', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ session: { token: 'tok_abc' } }, 'test');
      const parsed = lastLine() as { session: { token: string } };
      expect(parsed.session.token).toBe('[REDACTED]');
    });

    it('redacts top-level accessToken (camelCase)', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ accessToken: 'jwt.abc.xyz' }, 'test');
      expect(lastLine().accessToken).toBe('[REDACTED]');
    });

    it('redacts top-level access_token (snake_case)', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ access_token: 'jwt.abc.xyz' }, 'test');
      expect(lastLine().access_token).toBe('[REDACTED]');
    });

    it('redacts top-level refreshToken (camelCase)', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ refreshToken: 'ref.abc.xyz' }, 'test');
      expect(lastLine().refreshToken).toBe('[REDACTED]');
    });

    it('redacts top-level refresh_token (snake_case)', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ refresh_token: 'ref.abc.xyz' }, 'test');
      expect(lastLine().refresh_token).toBe('[REDACTED]');
    });

    it('redacts authorization field', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ authorization: 'Bearer tok' }, 'test');
      expect(lastLine().authorization).toBe('[REDACTED]');
    });

    it('redacts nested apiKey', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ config: { apiKey: 'key_123' } }, 'test');
      const parsed = lastLine() as { config: { apiKey: string } };
      expect(parsed.config.apiKey).toBe('[REDACTED]');
    });

    it('does not redact non-sensitive fields', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ userId: 'usr_123', event: 'auth.login' }, 'test');
      const line = lastLine();
      expect(line.userId).toBe('usr_123');
      expect(line.event).toBe('auth.login');
    });
  });

  describe('base fields', () => {
    it('includes service name on every log line', () => {
      const { instance, lastLine } = captureLogger();
      instance.info({ event: 'startup' }, 'msg');
      expect(lastLine().service).toBe('flowbrand-api');
    });
  });
});
