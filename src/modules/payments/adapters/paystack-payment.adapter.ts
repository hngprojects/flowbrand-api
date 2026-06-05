import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../../../config/env';
import * as SYS_MSG from '../../../constants/system.messages';
import { PAYSTACK_CLIENT } from '../providers/paystack-client.provider';
import type { IPaystackClient } from '../providers/paystack-client.provider';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { InitiateSubscriptionDto } from '../dto/initiate-subscription.dto';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import {
  InitiatePaymentResult,
  InitiateSubscriptionResult,
  PaymentProvider,
  VerifyPaymentResult,
  WebhookEvent,
} from '../interfaces/payment-provider.interface';
import { PRICING } from '../constants/pricing.constants';

interface PaystackInitializeData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface PaystackVerifyData {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  authorization?: {
    last4?: string;
    brand?: string;
  };
}

interface PaystackSubscriptionFetchData {
  email_token: string;
}

const CARD_BRAND_DISPLAY: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  verve: 'Verve',
  amex: 'American Express',
};

function toPaymentStatus(paystackStatus: string): PaymentStatus {
  switch (paystackStatus) {
    case 'success':
      return PaymentStatus.SUCCESS;
    case 'failed':
      return PaymentStatus.FAILED;
    case 'reversed':
      return PaymentStatus.REFUNDED;
    default:
      return PaymentStatus.PENDING;
  }
}

@Injectable()
export class PaystackPaymentAdapter implements PaymentProvider {
  private readonly logger = new Logger(PaystackPaymentAdapter.name);

  constructor(
    // SEC-01: secret key stays in PaystackClientProvider — never logged or returned in responses
    @Inject(PAYSTACK_CLIENT) private readonly client: IPaystackClient,
  ) { }

  /** Initializes a one-time or subscription payment checkout session. */
  async initiatePayment(dto: InitiatePaymentDto, userId: string, email: string): Promise<InitiatePaymentResult> {
    const reference = randomUUID();
    try {
      const amountKobo = dto.type === PaymentType.ONE_TIME ? PRICING.PRO_ONETIME_KOBO : PRICING.PRO_MONTHLY_KOBO;
      const response = await this.client.transaction.initialize({
        email,
        amount: String(amountKobo),
        reference,
        metadata: { userId, plan: dto.plan, type: dto.type },
        channels: ['card', 'bank_transfer'],
      });

      if (!response.status) {
        throw new Error(response.message ?? 'Paystack rejected the request');
      }

      const data = response.data as PaystackInitializeData;
      return {
        reference: data.reference,
        authorizationUrl: data.authorization_url,
        provider: 'paystack',
      };
    } catch (err: unknown) {
      this.logger.error({ message: 'initiatePayment failed', reason: (err as Error).message });
      throw new PaymentFailedException((err as Error).message);
    }
  }

  /** Verifies a payment reference and returns status + card details. */
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    try {
      const response = await this.client.transaction.verify({ reference });
      if (!response.status) {
        throw new Error(response.message ?? 'Paystack rejected the request');
      }
      const data = response.data as PaystackVerifyData;

      // SEC-02: store only last4 and brand — no full card data
      const cardLast4 = data.authorization?.last4;
      const rawBrand = data.authorization?.brand?.toLowerCase() ?? '';
      const cardBrand = CARD_BRAND_DISPLAY[rawBrand] ?? rawBrand;

      return {
        reference: data.reference,
        status: toPaymentStatus(data.status),
        amount: data.amount,
        currency: data.currency,
        ...(cardLast4 ? { cardLast4 } : {}),
        ...(cardBrand ? { cardBrand } : {}),
      };
    } catch (err: unknown) {
      throw new PaymentFailedException((err as Error).message);
    }
  }

  /**
   * Initializes a recurring subscription checkout using a pre-created Paystack plan.
   * The real SUB_xxx code arrives via the subscription.create webhook — do NOT persist
   * the access_code returned here as provider_subscription_code.
   */
  async initiateSubscription(dto: InitiateSubscriptionDto, userId: string, email: string): Promise<InitiateSubscriptionResult> {
    const planCode =
      dto.billingCycle === BillingCycle.ANNUAL
        ? env.PAYSTACK_PRO_ANNUAL_PLAN_CODE!
        : env.PAYSTACK_PRO_MONTHLY_PLAN_CODE!;

    try {
      const response = await this.client.transaction.initialize({
        email,
        // Paystack ignores amount when plan is set — plan defines the charge amount
        amount: '0',
        plan: planCode,
        metadata: { userId, plan: dto.plan, billingCycle: dto.billingCycle },
      });

      if (!response.status) {
        throw new Error(response.message ?? 'Paystack rejected the request');
      }
      const data = response.data as PaystackInitializeData;
      return {
        // access_code is the checkout session token — NOT the SUB_xxx subscription identifier.
        // The real subscription code arrives in the subscription.create webhook (M4-BE-021).
        subscriptionCode: data.access_code,
        authorizationUrl: data.authorization_url,
        provider: 'paystack',
      };
    } catch (err: unknown) {
      throw new PaymentFailedException((err as Error).message);
    }
  }

  /** Fetches the email token then disables the subscription — two-step Paystack requirement. */
  async cancelSubscription(subscriptionCode: string): Promise<void> {
    try {
      const fetchResponse = await this.client.subscription.fetch({ code: subscriptionCode });
      if (!fetchResponse.status) {
        throw new PaymentFailedException(fetchResponse.message ?? 'Paystack rejected the request');
      }
      const emailToken = (fetchResponse.data as PaystackSubscriptionFetchData)?.email_token;
      if (!emailToken) {
        throw new PaymentFailedException(SYS_MSG.SUBSCRIPTION_CANCEL_TOKEN_MISSING);
      }
      await this.client.subscription.disable({ code: subscriptionCode, token: emailToken });
    } catch (err: unknown) {
      throw err instanceof PaymentFailedException ? err : new PaymentFailedException((err as Error).message);
    }
  }

  /**
   * Verifies the Paystack webhook HMAC-SHA512 signature then parses the event.
   * Routing and side effects belong in M4-BE-021 — this method only handles verification.
   */
  handleWebhookEvent(payload: Buffer, signature: string): Promise<WebhookEvent> {
    const rawBody = payload;

    // SEC-03: timingSafeEqual prevents timing-attack signature comparison
    const expected = createHmac('sha512', env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');

    if (
      receivedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      return Promise.reject(new UnauthorizedException(SYS_MSG.WEBHOOK_SIGNATURE_INVALID));
    }

    try {
      const parsed = JSON.parse(rawBody.toString()) as Record<string, unknown>;
      const data = parsed.data as Record<string, unknown>;
      return Promise.resolve({
        type: parsed.event as string,
        reference: data.reference as string,
        data,
      });
    } catch (err: unknown) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
