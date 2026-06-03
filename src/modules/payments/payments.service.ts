import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import * as SYS_MSG from '../../constants/system.messages';
import { PaymentModelAction } from './actions/payment.model-action';
import { SubscriptionModelAction } from './actions/subscription.model-action';
import { MockPaymentAdapter } from './adapters/mock-payment.adapter';
import { PRICING } from './constants/pricing.constants';
import { BillingCycle } from './enums/billing-cycle.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentType } from './enums/payment-type.enum';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import {
  InitiatePaymentResult,
  InitiateSubscriptionResult,
  PaymentProvider,
  VerifyPaymentResult,
  WebhookEvent,
} from './interfaces/payment-provider.interface';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { InitiateSubscriptionDto } from './dto/initiate-subscription.dto';

@Injectable()
export class PaymentsService {
  private readonly adapter: PaymentProvider;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentModelAction: PaymentModelAction,
    private readonly subscriptionModelAction: SubscriptionModelAction,
    private readonly mockAdapter: MockPaymentAdapter,
  ) {
    this.adapter = this.resolveAdapter();
  }

  private resolveAdapter(): PaymentProvider {
    // Zod already rejects unknown providers at boot (EC-01).
    // This switch catches known-but-unimplemented providers and fails fast at
    // module init rather than silently falling through at runtime.
    switch (env.PAYMENT_PROVIDER) {
      case 'mock':
        return this.mockAdapter;
      default:
        throw new Error(`${SYS_MSG.PAYMENT_PROVIDER_NOT_IMPLEMENTED}: '${env.PAYMENT_PROVIDER}'`);
    }
  }

  /** Initiates a one-time or subscription-intent payment and records a pending payment row. */
  async initiatePayment(dto: InitiatePaymentDto): Promise<InitiatePaymentResult> {
    const amount = this.resolveAmount(dto);
    const result = await this.adapter.initiatePayment(dto);
    await this.paymentModelAction.create({
      createPayload: {
        user_id: dto.userId,
        subscription_id: null,
        payment_type: dto.type,
        plan: dto.plan,
        amount,
        currency: 'NGN',
        status: PaymentStatus.PENDING,
        provider_reference: result.reference,
        provider: env.PAYMENT_PROVIDER,
        idempotency_key: randomUUID(),
        metadata: this.sanitizeMetadata({}),
      },
      transactionOptions: { useTransaction: false },
    });
    return result;
  }

  /** Verifies a payment reference with the configured provider. */
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    return this.adapter.verifyPayment(reference);
  }

  /** Creates a subscription, then records its initial pending payment linked back via subscription_id. */
  async initiateSubscription(dto: InitiateSubscriptionDto): Promise<InitiateSubscriptionResult> {
    const result = await this.adapter.initiateSubscription(dto);

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    if (dto.billingCycle === BillingCycle.ANNUAL) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Subscription row is created first; the payment FK points to it (not the reverse).
    const subscription = await this.subscriptionModelAction.create({
      createPayload: {
        user_id: dto.userId,
        plan: dto.plan,
        billing_cycle: dto.billingCycle,
        status: SubscriptionStatus.ACTIVE,
        provider_subscription_code: result.subscriptionCode,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      },
      transactionOptions: { useTransaction: false },
    });

    await this.paymentModelAction.create({
      createPayload: {
        user_id: dto.userId,
        subscription_id: subscription.id,
        payment_type: PaymentType.SUBSCRIPTION,
        plan: dto.plan,
        amount: dto.billingCycle === BillingCycle.ANNUAL ? PRICING.PRO_ANNUAL : PRICING.PRO_MONTHLY,
        currency: 'NGN',
        status: PaymentStatus.PENDING,
        provider: env.PAYMENT_PROVIDER,
        idempotency_key: randomUUID(),
        metadata: this.sanitizeMetadata({}),
      },
      transactionOptions: { useTransaction: false },
    });

    return result;
  }

  /** Cancels a subscription with the configured provider. */
  async cancelSubscription(subscriptionCode: string): Promise<void> {
    return this.adapter.cancelSubscription(subscriptionCode);
  }

  /** Routes a raw webhook payload to the configured provider's parser. */
  async handleWebhookEvent(payload: unknown, signature: string): Promise<WebhookEvent> {
    return this.adapter.handleWebhookEvent(payload, signature);
  }

  private resolveAmount(dto: InitiatePaymentDto): number {
    return dto.type === PaymentType.ONE_TIME ? PRICING.PRO_ONETIME : PRICING.PRO_MONTHLY;
  }

  // SEC-04: strip card fields from any jsonb metadata before storage
  private sanitizeMetadata(raw: Record<string, unknown>): Record<string, unknown> {
    const BLOCKED = new Set(['card_number', 'cvv', 'pan', 'pin']);
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !BLOCKED.has(k)));
  }
}
