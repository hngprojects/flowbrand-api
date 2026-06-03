import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { InitiateSubscriptionDto } from '../dto/initiate-subscription.dto';

export interface InitiatePaymentResult {
  reference: string;
  authorizationUrl: string;
  provider: string;
}

export interface VerifyPaymentResult {
  reference: string;
  status: 'success' | 'pending' | 'failed';
  amount: number;
  currency: string;
  cardLast4?: string;
  cardBrand?: string;
}

export interface InitiateSubscriptionResult {
  subscriptionCode: string;
  authorizationUrl: string;
  provider: string;
}

export interface WebhookEvent {
  type: string;
  reference: string;
  data: Record<string, unknown>;
}

export interface PaymentProvider {
  initiatePayment(dto: InitiatePaymentDto): Promise<InitiatePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  initiateSubscription(dto: InitiateSubscriptionDto): Promise<InitiateSubscriptionResult>;
  cancelSubscription(subscriptionCode: string): Promise<void>;
  handleWebhookEvent(payload: unknown, signature: string): Promise<WebhookEvent>;
}
