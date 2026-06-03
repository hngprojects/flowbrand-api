import { Injectable } from '@nestjs/common';
import { env } from '../../../config/env';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { InitiateSubscriptionDto } from '../dto/initiate-subscription.dto';
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
  async initiatePayment(_dto: InitiatePaymentDto): Promise<InitiatePaymentResult> {
    if (env.TEST_PAYMENT_OUTCOME === 'failure') throw new PaymentFailedException('mock failure');
    return {
      reference: `mock_ref_${Date.now()}`,
      authorizationUrl: 'https://mock.pay/authorize',
      provider: 'mock',
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const status = env.TEST_PAYMENT_OUTCOME === 'pending' ? 'pending' : 'success';
    return { reference, status, amount: 9999, currency: 'NGN' };
  }

  async initiateSubscription(_dto: InitiateSubscriptionDto): Promise<InitiateSubscriptionResult> {
    if (env.TEST_PAYMENT_OUTCOME === 'failure') throw new PaymentFailedException('mock failure');
    return {
      subscriptionCode: `mock_sub_${Date.now()}`,
      authorizationUrl: 'https://mock.pay/sub',
      provider: 'mock',
    };
  }

  async cancelSubscription(_code: string): Promise<void> {
    // no-op for mock
  }

  async handleWebhookEvent(payload: unknown, _sig: string): Promise<WebhookEvent> {
    return { type: 'mock.event', reference: 'mock_ref', data: payload as Record<string, unknown> };
  }
}
