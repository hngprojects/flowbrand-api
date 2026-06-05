import Paystack from '@paystack/paystack-sdk';
import { env } from '../../../config/env';

export const PAYSTACK_CLIENT = 'PAYSTACK_CLIENT';

// Typed subset of the Paystack SDK surface used by PaystackPaymentAdapter.
// The SDK's Paystack class is typed as [index: string]: any; this interface
// pins the shapes we depend on so the adapter is fully type-safe.
export interface IPaystackTransaction {
  initialize(params: {
    email: string;
    amount: number;
    reference?: string;
    plan?: string;
    metadata?: string;
    channels?: string[];
  }): Promise<{ data: unknown }>;
  verify(params: { reference: string }): Promise<{ data: unknown }>;
}

export interface IPaystackSubscription {
  fetch(params: { code: string }): Promise<{ data: unknown }>;
  disable(params: { code: string; token: string }): Promise<{ data: unknown }>;
}

export interface IPaystackClient {
  transaction: IPaystackTransaction;
  subscription: IPaystackSubscription;
}

export const PaystackClientProvider = {
  provide: PAYSTACK_CLIENT,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion
  useFactory: (): IPaystackClient => new Paystack(env.PAYSTACK_SECRET_KEY!) as unknown as IPaystackClient,
};
