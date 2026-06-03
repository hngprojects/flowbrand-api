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

  CONTACT_ADMIN_EMAIL: z.string().email().default('useseil@hng14.com'),

  UPLOAD_STORAGE_ENDPOINT: z.string().default(''),
  UPLOAD_STORAGE_ACCESS_KEY: z.string().default(''),
  UPLOAD_STORAGE_SECRET_KEY: z.string().default(''),
  UPLOAD_STORAGE_BUCKET: z.string().default(''),
  UPLOAD_STORAGE_REGION: z.string().default(''),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

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
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  PAYMENT_PROVIDER: z.enum(['mock', 'paystack', 'flutterwave', 'stripe']).default('mock'),
  TEST_PAYMENT_OUTCOME: z.enum(['success', 'failure', 'pending']).default('success'),
  PRO_PLAN_PRICE_ONETIME: z.coerce.number().int().nonnegative().optional(),
  PRO_PLAN_PRICE_MONTHLY: z.coerce.number().int().nonnegative().optional(),
  PRO_PLAN_PRICE_ANNUAL: z.coerce.number().int().nonnegative().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:\n', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
