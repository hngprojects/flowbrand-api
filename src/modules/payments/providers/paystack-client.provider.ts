import Paystack from '@paystack/paystack-sdk';
import { env } from '../../../config/env';

export const PAYSTACK_CLIENT = 'PAYSTACK_CLIENT';

export const PaystackClientProvider = {
  provide: PAYSTACK_CLIENT,
  useFactory: (): Paystack => new Paystack(env.PAYSTACK_SECRET_KEY!),
};
