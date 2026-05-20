import { logger } from './pino.logger';

describe('pino logger instance', () => {
  it('is defined', () => {
    expect(logger).toBeDefined();
  });

  it('exposes expected log methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('has level set to a valid level', () => {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    expect(validLevels).toContain(logger.level);
  });
});
