import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { env } from '../../config/env';
import * as SYS_MSG from '../../constants/system.messages';
import { APP_EVENTS } from '../../common/constants/app-events';
import { PlanUpgradedEvent } from '../../common/events/events';
import { PaymentModelAction } from './actions/payment.model-action';
import { SubscriptionModelAction } from './actions/subscription.model-action';
import { MockPaymentAdapter } from './adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from './adapters/paystack-payment.adapter';
import { PRICING } from './constants/pricing.constants';
import { BillingCycle } from './enums/billing-cycle.enum';
import { PaymentPlan } from './enums/payment-plan.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentType } from './enums/payment-type.enum';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import {
  InitiatePaymentResult,
  InitiateSubscriptionResult,
  PaymentProvider,
  PaymentVerifyResponse,
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
    private readonly eventEmitter: EventEmitter2,
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

  async resolvePayment(userId: string, reference: string): Promise<PaymentVerifyResponse> {
    // SEC-01: ownership check before any gateway call
    const payment = await this.paymentModelAction.get({
      identifierOptions: { provider_reference: reference },
    });
    if (!payment || payment.user_id !== userId) {
      throw new NotFoundException(SYS_MSG.PAYMENT_NOT_FOUND);
    }

    // FR-4: short-circuit — already resolved, no gateway call needed
    if (payment.status !== PaymentStatus.PENDING) {
      return this.buildResponse(payment.status, reference, payment);
    }

    // FR-5: live gateway verify
    let gatewayResult: VerifyPaymentResult;
    try {
      gatewayResult = await this.verifyPayment(reference);
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (isTimeout) throw new GatewayTimeoutException(SYS_MSG.PAYMENT_PROVIDER_TIMEOUT);
      throw new BadGatewayException(SYS_MSG.PAYMENT_FAILED);
    }

    // SEC-05: amount check runs BEFORE any DB write — mismatch → 422
    if (gatewayResult.status === PaymentStatus.SUCCESS) {
      if (gatewayResult.amount !== payment.amount_kobo) {
        this.logger.error({
          message: SYS_MSG.PAYMENT_AMOUNT_MISMATCH,
          reference,
          expected: payment.amount_kobo,
          received: gatewayResult.amount,
        });
        throw new UnprocessableEntityException(SYS_MSG.PAYMENT_AMOUNT_MISMATCH);
      }
    }

    if (gatewayResult.status === PaymentStatus.SUCCESS) {
      let activated = false;
      await this.dataSource.transaction(async (manager) => {
        await this.paymentModelAction.update({
          identifierOptions: { id: payment.id },
          updatePayload: {
            status: PaymentStatus.SUCCESS,
            card_last4: gatewayResult.cardLast4 ?? null,
            card_brand: gatewayResult.cardBrand ?? null,
            paid_at: new Date(),
          },
          transactionOptions: { useTransaction: true, transaction: manager },
        });

        if (payment.payment_type === PaymentType.ONE_TIME) {
          activated = await this.activateProSubscription(userId, manager);
        } else {
          activated = await this.activateSubscriptionPayment(userId, manager);
        }
      });

      // Emit AFTER transaction commits (CONTRIBUTING.md domain event rule).
      // Skip emit if SUBSCRIPTION path found no PENDING row — Pro access not confirmed.
      if (activated) {
        this.eventEmitter.emit(
          APP_EVENTS.PLAN_UPGRADED,
          new PlanUpgradedEvent(userId, PaymentPlan.PRO, reference),
        );
      }

      return this.buildResponse(PaymentStatus.SUCCESS, reference, {
        ...payment,
        status: PaymentStatus.SUCCESS,
        card_last4: gatewayResult.cardLast4 ?? null,
        card_brand: gatewayResult.cardBrand ?? null,
      });
    }

    if (gatewayResult.status === PaymentStatus.FAILED) {
      await this.paymentModelAction.update({
        identifierOptions: { id: payment.id },
        updatePayload: { status: PaymentStatus.FAILED },
        transactionOptions: { useTransaction: false },
      });
      return this.buildResponse(PaymentStatus.FAILED, reference, null);
    }

    // PENDING — no DB write; client polls again
    return this.buildResponse(PaymentStatus.PENDING, reference, null);
  }

  private async activateProSubscription(userId: string, manager: EntityManager): Promise<boolean> {
    // Pre-check before INSERT: the partial unique index covers PENDING + ACTIVE, so a failed
    // INSERT inside an open transaction aborts the whole transaction even if the error is caught
    // at the application level. Checking first avoids that aborted-transaction problem.
    const { payload: existing } = await this.subscriptionModelAction.list({
      filterRecordOptions: [
        { user_id: userId, status: SubscriptionStatus.ACTIVE },
        { user_id: userId, status: SubscriptionStatus.PENDING },
      ],
      paginationPayload: { page: 1, limit: 1 },
    });

    if (existing.length > 0) {
      this.logger.warn({ message: 'Pro subscription already active — idempotent skip', userId });
      return true;
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.subscriptionModelAction.create({
      createPayload: {
        user_id: userId,
        plan: PaymentPlan.PRO,
        billing_cycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      },
      transactionOptions: { useTransaction: true, transaction: manager },
    });
    return true;
  }

  private async activateSubscriptionPayment(userId: string, manager: EntityManager): Promise<boolean> {
    const { payload: pending } = await this.subscriptionModelAction.find({
      findOptions: { user_id: userId, status: SubscriptionStatus.PENDING },
      transactionOptions: { useTransaction: true, transaction: manager },
    });
    if (!pending.length) {
      this.logger.warn({ message: 'No PENDING subscription row found to activate', userId });
      return false;
    }
    const sub = pending[0];
    const now = new Date();
    const periodEnd = new Date(now);
    if (sub.billing_cycle === BillingCycle.ANNUAL) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    await this.subscriptionModelAction.update({
      identifierOptions: { id: sub.id },
      updatePayload: {
        status: SubscriptionStatus.ACTIVE,
        current_period_start: now,
        current_period_end: periodEnd,
      },
      transactionOptions: { useTransaction: true, transaction: manager },
    });
    return true;
  }

  private buildResponse(
    status: PaymentStatus,
    reference: string,
    payment: Partial<Payment> | null,
  ): PaymentVerifyResponse {
    if (status === PaymentStatus.SUCCESS && payment) {
      return {
        status,
        plan: PaymentPlan.PRO,
        reference,
        amount: payment.amount_kobo,
        currency: 'NGN',
        cardLast4: payment.card_last4 ?? undefined,
        cardBrand: payment.card_brand ?? undefined,
      };
    }
    return { status, reference };
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

    let paymentId = '';
    try {
      const payment: Payment = await this.dataSource.transaction(async (manager) => {
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

        return this.paymentModelAction.create({
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
      });
      paymentId = payment.id;
    } catch (err: unknown) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
        // Row exists — check if a prior completed attempt left a subscription code
        const { payload: subs } = await this.subscriptionModelAction.find({
          findOptions: { user_id: userId, plan: dto.plan, billing_cycle: dto.billingCycle },
          order: { created_at: 'DESC' },
          paginationPayload: { limit: 1, page: 1 },
          transactionOptions: { useTransaction: false },
        });
        const existing: Subscription | undefined = subs[0];
        if (existing?.provider_subscription_code) {
          // Look up the payment row for this subscription to recover its provider_reference.
          // The frontend needs the reference to call GET /verify and confirm the charge.
          const priorPayment = await this.paymentModelAction.get({
            identifierOptions: { subscription_id: existing.id },
          });
          return {
            reference: priorPayment?.provider_reference ?? '',
            subscriptionCode: existing.provider_subscription_code,
            authorizationUrl: '',
            provider: env.PAYMENT_PROVIDER,
          };
        }
        // Subscription exists but has no code — prior attempt failed after DB write but before provider update.
        // 409 is correct: the in-flight subscription must be resolved before creating another.
        throw new ConflictException(SYS_MSG.SUBSCRIPTION_ALREADY_ACTIVE);
      }
      throw err;
    }

    const result = await this.adapter.initiateSubscription(dto, userId, email);

    await this.paymentModelAction.update({
      identifierOptions: { id: paymentId },
      updatePayload: { provider_reference: result.reference },
      transactionOptions: { useTransaction: false },
    });

    // provider_subscription_code is NOT set here — the real SUB_xxx code arrives
    // via the subscription.create webhook (M4-BE-021). Storing access_code here
    // would persist the wrong identifier.

    return result;
  }

  /** Cancels a subscription with the configured provider. */
  async cancelSubscription(subscriptionCode: string): Promise<void> {
    return this.adapter.cancelSubscription(subscriptionCode);
  }

  /** Routes a raw webhook payload to the configured provider's parser. */
  async handleWebhookEvent(payload: Buffer, signature: string): Promise<WebhookEvent> {
    return this.adapter.handleWebhookEvent(payload, signature);
  }

  /**
   * Verifies the webhook signature via the adapter, normalizes the event, and
   * dispatches to the appropriate private handler. After a valid signature, all
   * processing errors are swallowed so the provider receives HTTP 200 and does
   * not retry indefinitely.
   *
   * Throws UnauthorizedException if the signature is invalid — the only exception
   * that should propagate to the controller.
   */
  async processWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    const event = await this.handleWebhookEvent(rawBody, signature);

    try {
      switch (event.type) {
        case 'charge.success':
          await this.handleChargeSuccess(event);
          break;
        case 'charge.failed':
        case 'charge.dispute.create':
          await this.handleChargeFailed(event);
          break;
        case 'subscription.disable':
          await this.handleSubscriptionCancelled(event);
          break;
        case 'subscription.not_renew':
          await this.handleSubscriptionSetNotRenew(event);
          break;
        case 'subscription.expiry_date_update':
          this.logger.log({ message: 'Subscription expiry update received', reference: event.reference });
          break;
        default:
          this.logger.log({ message: 'Unhandled webhook event type', type: event.type });
      }
    } catch (err: unknown) {
      this.logger.error({
        message: SYS_MSG.WEBHOOK_PROCESSING_ERROR,
        type: event.type,
        reference: event.reference,
        error: (err as Error).message,
      });
    }
  }

  private async handleChargeSuccess(event: WebhookEvent): Promise<void> {
    const payment = await this.paymentModelAction.get({
      identifierOptions: { provider_reference: event.reference },
    });

    if (!payment) {
      this.logger.warn({ message: 'Payment row not found for charge.success', reference: event.reference });
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log({ message: 'Charge.success replayed — already terminal', reference: event.reference, status: payment.status });
      return;
    }

    const eventData = event.data;
    const receivedAmount = eventData.amount as number | undefined;
    if (receivedAmount !== undefined && receivedAmount !== payment.amount_kobo) {
      this.logger.error({
        message: SYS_MSG.PAYMENT_AMOUNT_MISMATCH,
        reference: event.reference,
        expected: payment.amount_kobo,
        received: receivedAmount,
      });
      return;
    }

    const auth = eventData.authorization as Record<string, unknown> | undefined;
    const cardLast4 = (auth?.last4 as string | undefined) ?? null;
    const cardBrand = (auth?.brand as string | undefined) ?? null;

    await this.dataSource.transaction(async (manager) => {
      await this.paymentModelAction.update({
        identifierOptions: { id: payment.id },
        updatePayload: {
          status: PaymentStatus.SUCCESS,
          card_last4: cardLast4,
          card_brand: cardBrand,
          paid_at: new Date(),
        },
        transactionOptions: { useTransaction: true, transaction: manager },
      });

      if (payment.payment_type === PaymentType.ONE_TIME) {
        await this.activateProSubscription(payment.user_id, manager);
      } else {
        await this.activateSubscriptionPayment(payment.user_id, manager);
      }
    });

    this.eventEmitter.emit(
      APP_EVENTS.PLAN_UPGRADED,
      new PlanUpgradedEvent(payment.user_id, PaymentPlan.PRO, event.reference),
    );
  }

  private async handleChargeFailed(event: WebhookEvent): Promise<void> {
    const payment = await this.paymentModelAction.get({
      identifierOptions: { provider_reference: event.reference },
    });

    if (!payment || payment.status !== PaymentStatus.PENDING) {
      return;
    }

    await this.paymentModelAction.update({
      identifierOptions: { id: payment.id },
      updatePayload: { status: PaymentStatus.FAILED },
      transactionOptions: { useTransaction: false },
    });
  }

  // event.reference is data.subscription_code for subscription events (adapter mapping, DC-3)
  private async handleSubscriptionCancelled(event: WebhookEvent): Promise<void> {
    const { payload: subs } = await this.subscriptionModelAction.list({
      filterRecordOptions: { provider_subscription_code: event.reference, status: SubscriptionStatus.ACTIVE },
      paginationPayload: { page: 1, limit: 1 },
    });

    const sub = subs[0];
    if (!sub) {
      this.logger.warn({ message: 'Subscription not found for cancellation webhook', subscriptionCode: event.reference });
      return;
    }

    await this.subscriptionModelAction.update({
      identifierOptions: { id: sub.id },
      updatePayload: {
        status: SubscriptionStatus.CANCELLED,
        cancel_at_period_end: false,
        cancelled_at: new Date(),
      },
      transactionOptions: { useTransaction: false },
    });
  }

  // event.reference is data.subscription_code for subscription events (adapter mapping, DC-3)
  private async handleSubscriptionSetNotRenew(event: WebhookEvent): Promise<void> {
    const { payload: subs } = await this.subscriptionModelAction.list({
      filterRecordOptions: { provider_subscription_code: event.reference, status: SubscriptionStatus.ACTIVE },
      paginationPayload: { page: 1, limit: 1 },
    });

    const sub = subs[0];
    if (!sub) {
      this.logger.warn({ message: 'Subscription not found for not_renew webhook', subscriptionCode: event.reference });
      return;
    }

    await this.subscriptionModelAction.update({
      identifierOptions: { id: sub.id },
      updatePayload: { cancel_at_period_end: true },
      transactionOptions: { useTransaction: false },
    });
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
