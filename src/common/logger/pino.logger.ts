import { env } from '../../config/env';
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

const isDev = env.NODE_ENV === 'development';

const logLevel = env.LOG_LEVEL;

const REDACTED_PATHS = [
  'password',
  '*.password',
  'password_hash',
  '*.password_hash',
  'token',
  '*.token',
  'token_hash',
  '*.token_hash',
  'otp_code',
  '*.otp_code',
  'accessToken',
  '*.accessToken',
  'access_token',
  '*.access_token',
  'refreshToken',
  '*.refreshToken',
  'refresh_token',
  '*.refresh_token',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'authorization',
  '*.authorization',
];

const options: LoggerOptions = {
  level: logLevel,

  base: {
    service: 'flowbrand-api',
    env: process.env.NODE_ENV ?? 'development',
  },

  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },

  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}),
  },

  timestamp: () => `, "timestamp":"${new Date().toISOString()}"`,
};

const logger: PinoLogger = isDev
  ? pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '{event} - {msg}',
          singleLine: true,
        },
      },
    })
  : pino(options);

export { logger, logLevel };
