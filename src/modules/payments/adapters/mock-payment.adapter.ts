import { Injectable } from '@nestjs/common';
import { env } from '../../../config/env';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import {
  InitiatePaymentResult,
  InitiateSubscriptionResult,
  PaymentProvider,
  VerifyPaymentResult,
  WebhookEvent,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentAdapter implements PaymentProvider {
  initiatePayment(): Promise<InitiatePaymentResult> {
    if (env.TEST_PAYMENT_OUTCOME === 'failure') {
      return Promise.reject(new PaymentFailedException('mock failure'));
    }
    return Promise.resolve({
      reference: `mock_ref_${Date.now()}`,
      authorizationUrl: 'https://mock.pay/authorize',
      provider: 'mock',
    });
  }

  verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const status = env.TEST_PAYMENT_OUTCOME === 'pending' ? 'pending' : 'success';
    return Promise.resolve({ reference, status, amount: 9999, currency: 'NGN' });
  }

  initiateSubscription(): Promise<InitiateSubscriptionResult> {
    if (env.TEST_PAYMENT_OUTCOME === 'failure') {
      return Promise.reject(new PaymentFailedException('mock failure'));
    }
    return Promise.resolve({
      subscriptionCode: `mock_sub_${Date.now()}`,
      authorizationUrl: 'https://mock.pay/sub',
      provider: 'mock',
    });
  }

  cancelSubscription(): Promise<void> {
    return Promise.resolve();
  }

  handleWebhookEvent(payload: unknown): Promise<WebhookEvent> {
    return Promise.resolve({
      type: 'mock.event',
      reference: 'mock_ref',
      data: payload as Record<string, unknown>,
    });
  }
}
