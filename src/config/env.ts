import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const boolEnv = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string().min(1),
  DATABASE_SYNC: boolEnv.default(false),
  DATABASE_LOGGING: boolEnv.default(false),
  DATABASE_SSL: boolEnv.default(false),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default(''),

  CORS_ORIGIN: z.string().default('*'),
  SWAGGER_ENABLED: boolEnv.default(true),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_TLS: boolEnv.default(false),

  CONTACT_ADMIN_EMAIL: z.string().email().default('noreply@seil.app'),

  QUEUE_CONCURRENCY: z.coerce
    .number()
    .int()
    .default(3)
    .transform((v) => {
      if (v < 1) {
        console.warn('QUEUE_CONCURRENCY must be >= 1, defaulting to 1');
        return 1;
      }
      return v;
    }),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:\n', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
