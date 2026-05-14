import { registerAs } from '@nestjs/config';
import { env } from './env';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USERNAME,
}));
