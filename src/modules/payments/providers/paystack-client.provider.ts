import { env } from '../../../config/env';

export const PAYSTACK_CLIENT = 'PAYSTACK_CLIENT';

export interface PaystackResponse {
  status: boolean;
  message: string;
  data: unknown;
}

// Typed subset of the Paystack API surface used by PaystackPaymentAdapter.
export interface IPaystackTransaction {
  initialize(params: {
    email: string;
    amount: string;
    reference?: string;
    plan?: string;
    metadata?: string | Record<string, unknown>;
    channels?: string[];
  }): Promise<PaystackResponse>;
  verify(params: { reference: string }): Promise<PaystackResponse>;
}

export interface IPaystackSubscription {
  fetch(params: { code: string }): Promise<PaystackResponse>;
  disable(params: { code: string; token: string }): Promise<PaystackResponse>;
}

export interface IPaystackClient {
  transaction: IPaystackTransaction;
  subscription: IPaystackSubscription;
}

const BASE = 'https://api.paystack.co';

function createPaystackClient(secretKey: string): IPaystackClient {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };

  async function parseJson(res: Response): Promise<PaystackResponse> {
    return res.json().catch(() => {
      throw new Error(`Paystack HTTP error ${res.status}`);
    }) as Promise<PaystackResponse>;
  }

  return {
    transaction: {
      async initialize(params) {
        const res = await fetch(`${BASE}/transaction/initialize`, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
        });
        return parseJson(res);
      },
      async verify(params) {
        const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(params.reference)}`, {
          method: 'GET',
          headers,
        });
        return parseJson(res);
      },
    },
    subscription: {
      async fetch(params) {
        const res = await fetch(`${BASE}/subscription/${encodeURIComponent(params.code)}`, {
          method: 'GET',
          headers,
        });
        return parseJson(res);
      },
      async disable(params) {
        const res = await fetch(`${BASE}/subscription/disable`, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
        });
        return parseJson(res);
      },
    },
  };
}

export const PaystackClientProvider = {
  provide: PAYSTACK_CLIENT,
  useFactory: (): IPaystackClient => createPaystackClient(env.PAYSTACK_SECRET_KEY!),
};
