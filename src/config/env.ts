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
  /** Public host for browser-readable object URLs (no trailing slash). Combined with bucket + storage path. */
  UPLOAD_STORAGE_PUBLIC_ENDPOINT: z.string().default(''),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  GROQ_WHISPER_MODEL: z.string().default('whisper-large-v3-turbo'),

  ASSEMBLYAI_API_KEY: z.string().optional(),

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

  PAYMENT_PROVIDER: z.enum(['mock', 'paystack', 'flutterwave', 'stripe']),
  TEST_PAYMENT_OUTCOME: z.enum(['success', 'failure', 'pending']).default('success'),
  PRO_PLAN_PRICE_ONETIME_KOBO: z.coerce.number().int().positive().optional(),
  PRO_PLAN_PRICE_MONTHLY_KOBO: z.coerce.number().int().positive().optional(),
  PRO_PLAN_PRICE_ANNUAL_KOBO: z.coerce.number().int().positive().optional(),

  PAYSTACK_SECRET_KEY: z.string().startsWith('sk_').optional(),
  PAYSTACK_PUBLIC_KEY: z.string().startsWith('pk_').optional(),
  PAYSTACK_PRO_MONTHLY_PLAN_CODE: z.string().startsWith('PLN_').optional(),
  PAYSTACK_PRO_ANNUAL_PLAN_CODE: z.string().startsWith('PLN_').optional(),
}).superRefine((data, ctx) => {
  if (data.PAYMENT_PROVIDER === 'paystack') {
    const requiredWithPrefix: { key: 'PAYSTACK_SECRET_KEY' | 'PAYSTACK_PUBLIC_KEY' | 'PAYSTACK_PRO_MONTHLY_PLAN_CODE' | 'PAYSTACK_PRO_ANNUAL_PLAN_CODE'; prefix: string }[] = [
      { key: 'PAYSTACK_SECRET_KEY', prefix: 'sk_' },
      { key: 'PAYSTACK_PUBLIC_KEY', prefix: 'pk_' },
      { key: 'PAYSTACK_PRO_MONTHLY_PLAN_CODE', prefix: 'PLN_' },
      { key: 'PAYSTACK_PRO_ANNUAL_PLAN_CODE', prefix: 'PLN_' },
    ];
    for (const { key, prefix } of requiredWithPrefix) {
      const value = data[key];
      if (!value) {
        ctx.addIssue({ code: 'custom', message: `${key} is required when PAYMENT_PROVIDER=paystack`, path: [key] });
      } else if (value.length <= prefix.length || !/[a-zA-Z0-9]/.test(value.slice(prefix.length))) {
        ctx.addIssue({ code: 'custom', message: `${key} must have a non-empty alphanumeric suffix after '${prefix}'`, path: [key] });
      }
    }
    // SEC-07: reject test keys in production — live users paying with test cards is a misconfiguration
    if (data.NODE_ENV === 'production' && data.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')) {
      ctx.addIssue({ code: 'custom', message: 'PAYSTACK_SECRET_KEY must be a live key in production', path: ['PAYSTACK_SECRET_KEY'] });
    }
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:\n', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
