import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { InitiateSubscriptionDto } from '../dto/initiate-subscription.dto';
import { PaymentStatus } from '../enums/payment-status.enum';

export interface InitiatePaymentResult {
  reference: string;
  authorizationUrl: string;
  provider: string;
}

export interface VerifyPaymentResult {
  reference: string;
  status: PaymentStatus;
  /** Amount in the smallest currency unit (kobo for NGN). Always an integer. */
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

export interface InitiatePaymentResponse {
  statusCode: number;
  message: string;
  data: {
    reference: string;
    authorizationUrl: string;
    amount: number;
    currency: string;
  };
}

export interface PaymentProvider {
  initiatePayment(dto: InitiatePaymentDto, userId: string, email: string): Promise<InitiatePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  initiateSubscription(dto: InitiateSubscriptionDto, userId: string, email: string): Promise<InitiateSubscriptionResult>;
  cancelSubscription(subscriptionCode: string): Promise<void>;
  handleWebhookEvent(payload: Buffer, signature: string): Promise<WebhookEvent>;
}
