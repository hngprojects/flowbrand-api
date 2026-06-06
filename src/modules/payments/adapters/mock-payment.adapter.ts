import { Injectable } from '@nestjs/common';
import { env } from '../../../config/env';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { InitiateSubscriptionDto } from '../dto/initiate-subscription.dto';
import {
  InitiatePaymentResult,
  InitiateSubscriptionResult,
  PaymentProvider,
  VerifyPaymentResult,
  WebhookEvent,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentAdapter implements PaymentProvider {
  initiatePayment(_dto: InitiatePaymentDto, _userId: string, _email: string): Promise<InitiatePaymentResult> {
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
    const status = env.TEST_PAYMENT_OUTCOME === 'pending' ? PaymentStatus.PENDING : PaymentStatus.SUCCESS;
    return Promise.resolve({ reference, status, amount: 999900, currency: 'NGN' });
  }

  initiateSubscription(_dto: InitiateSubscriptionDto, _userId: string, _email: string): Promise<InitiateSubscriptionResult> {
    if (env.TEST_PAYMENT_OUTCOME === 'failure') {
      return Promise.reject(new PaymentFailedException('mock failure'));
    }
    return Promise.resolve({
      subscriptionCode: `mock_sub_${Date.now()}`,
      authorizationUrl: 'https://mock.pay/sub',
      provider: 'mock',
    });
  }

  cancelSubscription(_subscriptionCode: string): Promise<void> {
    return Promise.resolve();
  }

  handleWebhookEvent(_payload: Buffer, _signature: string): Promise<WebhookEvent> {
    return Promise.resolve({
      type: 'mock.event',
      reference: 'mock_ref',
      data: {},
    });
  }
}
