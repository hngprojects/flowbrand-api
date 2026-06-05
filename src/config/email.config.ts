import { registerAs } from '@nestjs/config';
import { env } from './env';

export const emailConfig = registerAs('email', () => ({
  from: env.EMAIL_FROM,
}));

export default emailConfig;
