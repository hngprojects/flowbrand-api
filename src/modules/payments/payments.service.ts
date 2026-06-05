import { ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { env } from '../../config/env';
import * as SYS_MSG from '../../constants/system.messages';
import { PaymentModelAction } from './actions/payment.model-action';
import { SubscriptionModelAction } from './actions/subscription.model-action';
import { MockPaymentAdapter } from './adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from './adapters/paystack-payment.adapter';
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
import { Payment } from './entities/payment.entity';
import { Subscription } from './entities/subscription.entity';

@Injectable()
export class PaymentsService {
  private readonly adapter: PaymentProvider;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentModelAction: PaymentModelAction,
    private readonly subscriptionModelAction: SubscriptionModelAction,
    private readonly mockAdapter: MockPaymentAdapter,
    private readonly paystackAdapter: PaystackPaymentAdapter,
    private readonly dataSource: DataSource,
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
      case 'paystack':
        return this.paystackAdapter;
      default:
        throw new InternalServerErrorException(`${SYS_MSG.PAYMENT_PROVIDER_NOT_IMPLEMENTED}: '${env.PAYMENT_PROVIDER}'`);
    }
  }

  /**
   * Creates a PENDING payment row first, then calls the provider.
   * If the provider call fails the row remains as an audit trail.
   * The unique idempotency_key index prevents duplicate charges on retry.
   */
  async initiatePayment(userId: string, email: string, dto: InitiatePaymentDto): Promise<InitiatePaymentResult> {
    const idempotencyKey = this.buildIdempotencyKey(userId, dto.plan, dto.type);

    let payment: Payment;
    try {

      payment = await this.paymentModelAction.create({
        createPayload: {
          user_id: userId,
          subscription_id: null,
          payment_type: dto.type,
          plan: dto.plan,
          amount_kobo: this.resolveAmountKobo(dto),
          currency: 'NGN',
          status: PaymentStatus.PENDING,
          provider_reference: null,
          provider: env.PAYMENT_PROVIDER,
          idempotency_key: idempotencyKey,
          metadata: this.sanitizeMetadata({}),
        },
        transactionOptions: { useTransaction: false },
      });
    } catch (err: unknown) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
        // Row exists — may be a fully-completed prior attempt or a partially-failed one
         
        const existing: Payment | null = await this.paymentModelAction.get({
          identifierOptions: { idempotency_key: idempotencyKey },
        });
        if (existing?.provider_reference) {
          // Prior attempt fully succeeded — idempotent return, no second provider call
          return { reference: existing.provider_reference, authorizationUrl: '', provider: existing.provider };
        }
        // Row has no reference — prior attempt failed between provider call and DB update.
        // 409 is correct: client should call verifyPayment to reconcile.
        throw new ConflictException(SYS_MSG.PAYMENT_ALREADY_INITIATED);
      }
      throw err;
    }

    const result = await this.adapter.initiatePayment(dto, userId, email);

    await this.paymentModelAction.update({
      identifierOptions: { id: payment.id },
      updatePayload: { provider_reference: result.reference },
      transactionOptions: { useTransaction: false },
    });

    return result;
  }

  /** Verifies a payment reference with the configured provider. */
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    return this.adapter.verifyPayment(reference);
  }

  /**
   * Creates subscription + payment rows atomically in PENDING state, then calls
   * the provider. Status is upgraded to ACTIVE by the M4-BE-021 webhook handler
   * on charge.success — never here.
   */
  async initiateSubscription(userId: string, email: string, dto: InitiateSubscriptionDto): Promise<InitiateSubscriptionResult> {
    const idempotencyKey = this.buildIdempotencyKey(userId, dto.plan, dto.billingCycle);

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    if (dto.billingCycle === BillingCycle.ANNUAL) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    let subscription: Subscription;
    try {
      subscription = await this.dataSource.transaction<Subscription>(async (manager) => {
         
        const sub: Subscription = await this.subscriptionModelAction.create({
          createPayload: {
            user_id: userId,
            plan: dto.plan,
            billing_cycle: dto.billingCycle,
            // PENDING until charge.success webhook confirms payment (set by M4-BE-021)
            status: SubscriptionStatus.PENDING,
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
          transactionOptions: { useTransaction: true, transaction: manager },
        });


        await this.paymentModelAction.create({
          createPayload: {
            user_id: userId,
            subscription_id: sub.id,
            payment_type: PaymentType.SUBSCRIPTION,
            plan: dto.plan,
            amount_kobo: dto.billingCycle === BillingCycle.ANNUAL ? PRICING.PRO_ANNUAL_KOBO : PRICING.PRO_MONTHLY_KOBO,
            currency: 'NGN',
            status: PaymentStatus.PENDING,
            provider: env.PAYMENT_PROVIDER,
            idempotency_key: idempotencyKey,
            provider_reference: null,
            metadata: this.sanitizeMetadata({}),
          },
          transactionOptions: { useTransaction: true, transaction: manager },
        });

        return sub;
      });
    } catch (err: unknown) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
        // Row exists — check if a prior completed attempt left a subscription code
         
        const { payload: subs } = await this.subscriptionModelAction.find({
          findOptions: { user_id: userId, plan: dto.plan },
          order: { created_at: 'DESC' },
          paginationPayload: { limit: 1, page: 1 },
          transactionOptions: { useTransaction: false },
        });
        const existing: Subscription | undefined = subs[0];
        if (existing?.provider_subscription_code) {
          // Prior attempt fully succeeded — idempotent return
          return { subscriptionCode: existing.provider_subscription_code, authorizationUrl: '', provider: env.PAYMENT_PROVIDER };
        }
        // Subscription exists but has no code — prior attempt failed after DB write but before provider update.
        // 409 is correct: the in-flight subscription must be resolved before creating another.
        throw new ConflictException(SYS_MSG.SUBSCRIPTION_ALREADY_ACTIVE);
      }
      throw err;
    }

    const result = await this.adapter.initiateSubscription(dto, userId, email);

    await this.subscriptionModelAction.update({
      identifierOptions: { id: subscription.id },
      updatePayload: { provider_subscription_code: result.subscriptionCode },
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

  private resolveAmountKobo(dto: InitiatePaymentDto): number {
    if (dto.type !== PaymentType.ONE_TIME) {
      // initiatePayment is only valid for one-time charges; subscription flows use initiateSubscription
      throw new InternalServerErrorException(`initiatePayment called with unsupported payment type: ${dto.type}`);
    }
    return PRICING.PRO_ONETIME_KOBO;
  }

  // SEC-04: strip card fields from any jsonb metadata before storage
  private sanitizeMetadata(raw: Record<string, unknown>): Record<string, unknown> {
    const BLOCKED = new Set(['card_number', 'cvv', 'pan', 'pin']);
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !BLOCKED.has(k)));
  }

  /**
   * Deterministic idempotency key for dedup within a 1-hour window.
   *
   * LIMITATION: Requests that span an hour boundary (e.g. 10:59:59 → 11:00:01) produce
   * different keys and bypass the unique index guard, allowing a duplicate charge.
   * The correct fix is a client-supplied Idempotency-Key header passed through the
   * controller — see M4-BE-020. Do not rely on this method for cross-hour dedup.
   */
  private buildIdempotencyKey(userId: string, plan: string, type: string): string {
    const windowHour = Math.floor(Date.now() / (60 * 60 * 1000));
    return createHash('sha256')
      .update(`${userId}:${plan}:${type}:${windowHour}`)
      .digest('hex');
  }
}
