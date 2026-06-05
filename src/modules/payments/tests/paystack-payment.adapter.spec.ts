import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaystackPaymentAdapter } from '../adapters/paystack-payment.adapter';
import { PAYSTACK_CLIENT } from '../providers/paystack-client.provider';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';

const MOCK_SECRET = 'sk_test_mock_secret_key';
const MOCK_MONTHLY_PLAN = 'PLN_monthly_mock';
const MOCK_ANNUAL_PLAN = 'PLN_annual_mock';

jest.mock('../../../config/env', () => ({
  env: {
    PAYSTACK_SECRET_KEY: 'sk_test_mock_secret_key',
    PAYSTACK_PRO_MONTHLY_PLAN_CODE: 'PLN_monthly_mock',
    PAYSTACK_PRO_ANNUAL_PLAN_CODE: 'PLN_annual_mock',
  },
}));

jest.mock('../constants/pricing.constants', () => ({
  PRICING: { PRO_ONETIME_KOBO: 900000, PRO_MONTHLY_KOBO: 300000, PRO_ANNUAL_KOBO: 3200000 },
}));

const mockTransaction = {
  initialize: jest.fn(),
  verify: jest.fn(),
};
const mockSubscription = {
  fetch: jest.fn(),
  disable: jest.fn(),
};

const mockPaystackClient = { transaction: mockTransaction, subscription: mockSubscription };

describe('PaystackPaymentAdapter', () => {
  let adapter: PaystackPaymentAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PaystackPaymentAdapter,
        { provide: PAYSTACK_CLIENT, useValue: mockPaystackClient },
      ],
    }).compile();
    adapter = module.get(PaystackPaymentAdapter);
  });

  // ─── initiatePayment ────────────────────────────────────────────────────────

  describe('initiatePayment', () => {
    const dto = { plan: PaymentPlan.PRO, type: PaymentType.ONE_TIME };
    const userId = 'user-1';
    const email = 'u@test.com';

    it('returns authorizationUrl and reference from Paystack response', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'https://paystack.com/pay/abc', reference: 'ref-123', access_code: 'ac_1' },
      });

      const result = await adapter.initiatePayment(dto, userId, email);

      expect(result.authorizationUrl).toBe('https://paystack.com/pay/abc');
      expect(result.reference).toBe('ref-123');
      expect(result.provider).toBe('paystack');
    });

    it('passes correct amount_kobo for ONE_TIME plan (900000 kobo = ₦9,000)', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'https://paystack.com/pay/abc', reference: 'ref-1', access_code: 'ac_1' },
      });

      await adapter.initiatePayment(dto, userId, email);

      const callArgs = mockTransaction.initialize.mock.calls[0][0];
      expect(callArgs.amount).toBe(900000);
    });

    it('generates a unique UUID reference for each call', async () => {
      mockTransaction.initialize.mockResolvedValue({
        data: { authorization_url: 'u', reference: 'r', access_code: 'a' },
      });

      await adapter.initiatePayment(dto, userId, email);
      await adapter.initiatePayment(dto, userId, email);

      const ref1 = mockTransaction.initialize.mock.calls[0][0].reference as string;
      const ref2 = mockTransaction.initialize.mock.calls[1][0].reference as string;
      expect(ref1).not.toBe(ref2);
      // UUID v4 format
      expect(ref1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('includes userId, plan, type in metadata — no PII beyond those fields (SEC-08)', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'u', reference: 'r', access_code: 'a' },
      });

      await adapter.initiatePayment(dto, userId, email);

      const raw = mockTransaction.initialize.mock.calls[0][0].metadata as string;
      const meta = JSON.parse(raw) as Record<string, unknown>;
      expect(meta).toHaveProperty('userId', userId);
      expect(meta).toHaveProperty('plan', PaymentPlan.PRO);
      expect(meta).toHaveProperty('type', PaymentType.ONE_TIME);
      expect(meta).not.toHaveProperty('email');
    });

    it('throws PaymentFailedException when Paystack SDK throws', async () => {
      mockTransaction.initialize.mockRejectedValueOnce(new Error('Bad Request'));

      await expect(adapter.initiatePayment(dto, userId, email)).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  // ─── verifyPayment ──────────────────────────────────────────────────────────

  describe('verifyPayment', () => {
    it('maps status=success → PaymentStatus.SUCCESS', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'success', reference: 'ref-1', amount: 900000, currency: 'NGN', authorization: { last4: '4081', brand: 'visa' } },
      });

      const result = await adapter.verifyPayment('ref-1');

      expect(result.status).toBe(PaymentStatus.SUCCESS);
      expect(result.reference).toBe('ref-1');
      expect(result.amount).toBe(900000);
      expect(result.currency).toBe('NGN');
    });

    it('maps status=failed → PaymentStatus.FAILED', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'failed', reference: 'ref-2', amount: 900000, currency: 'NGN' },
      });

      const result = await adapter.verifyPayment('ref-2');
      expect(result.status).toBe(PaymentStatus.FAILED);
    });

    it('maps status=pending → PaymentStatus.PENDING', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'pending', reference: 'ref-3', amount: 300000, currency: 'NGN' },
      });

      const result = await adapter.verifyPayment('ref-3');
      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('maps status=reversed → PaymentStatus.REFUNDED', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'reversed', reference: 'ref-4', amount: 900000, currency: 'NGN' },
      });

      const result = await adapter.verifyPayment('ref-4');
      expect(result.status).toBe(PaymentStatus.REFUNDED);
    });

    it('maps unknown status → PaymentStatus.PENDING (safe default)', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'unknown_state', reference: 'ref-5', amount: 900000, currency: 'NGN' },
      });

      const result = await adapter.verifyPayment('ref-5');
      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('normalises card brand to display name (visa → Visa)', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'success', reference: 'ref-6', amount: 900000, currency: 'NGN', authorization: { last4: '4081', brand: 'visa' } },
      });

      const result = await adapter.verifyPayment('ref-6');
      expect(result.cardBrand).toBe('Visa');
      expect(result.cardLast4).toBe('4081');
    });

    it('does not return card_number or cvv fields (SEC-02)', async () => {
      mockTransaction.verify.mockResolvedValueOnce({
        data: { status: 'success', reference: 'ref-7', amount: 900000, currency: 'NGN', authorization: { last4: '0001', brand: 'mastercard', card_number: '5531886652142950', cvv: '564' } },
      });

      const result = await adapter.verifyPayment('ref-7');
      expect(result).not.toHaveProperty('card_number');
      expect(result).not.toHaveProperty('cvv');
    });
  });

  // ─── initiateSubscription ───────────────────────────────────────────────────

  describe('initiateSubscription', () => {
    const userId = 'user-1';
    const email = 'u@test.com';

    it('uses PAYSTACK_PRO_MONTHLY_PLAN_CODE for monthly billing', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'u', access_code: 'ac_1', reference: 'r' },
      });

      await adapter.initiateSubscription({ plan: PaymentPlan.PRO, billingCycle: BillingCycle.MONTHLY }, userId, email);

      const callArgs = mockTransaction.initialize.mock.calls[0][0];
      expect(callArgs.plan).toBe(MOCK_MONTHLY_PLAN);
    });

    it('uses PAYSTACK_PRO_ANNUAL_PLAN_CODE for annual billing', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'u', access_code: 'ac_2', reference: 'r' },
      });

      await adapter.initiateSubscription({ plan: PaymentPlan.PRO, billingCycle: BillingCycle.ANNUAL }, userId, email);

      const callArgs = mockTransaction.initialize.mock.calls[0][0];
      expect(callArgs.plan).toBe(MOCK_ANNUAL_PLAN);
    });

    it('passes amount=0 (plan defines the charge, not amount field)', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'u', access_code: 'ac_1', reference: 'r' },
      });

      await adapter.initiateSubscription({ plan: PaymentPlan.PRO, billingCycle: BillingCycle.MONTHLY }, userId, email);

      expect(mockTransaction.initialize.mock.calls[0][0].amount).toBe(0);
    });

    it('returns access_code as subscriptionCode (not the real SUB_xxx — that arrives via webhook)', async () => {
      mockTransaction.initialize.mockResolvedValueOnce({
        data: { authorization_url: 'https://paystack.com/pay/sub', access_code: 'ACCESS_CODE_123', reference: 'r' },
      });

      const result = await adapter.initiateSubscription({ plan: PaymentPlan.PRO, billingCycle: BillingCycle.MONTHLY }, userId, email);

      expect(result.subscriptionCode).toBe('ACCESS_CODE_123');
      expect(result.authorizationUrl).toBe('https://paystack.com/pay/sub');
    });

    it('throws PaymentFailedException when SDK throws', async () => {
      mockTransaction.initialize.mockRejectedValueOnce(new Error('SDK error'));

      await expect(
        adapter.initiateSubscription({ plan: PaymentPlan.PRO, billingCycle: BillingCycle.MONTHLY }, userId, email),
      ).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  // ─── cancelSubscription ─────────────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('fetches email_token then disables the subscription (two-step Paystack flow)', async () => {
      mockSubscription.fetch.mockResolvedValueOnce({ data: { email_token: 'tok_abc' } });
      mockSubscription.disable.mockResolvedValueOnce({ status: true });

      await adapter.cancelSubscription('SUB_test_123');

      expect(mockSubscription.fetch).toHaveBeenCalledWith({ code: 'SUB_test_123' });
      expect(mockSubscription.disable).toHaveBeenCalledWith({ code: 'SUB_test_123', token: 'tok_abc' });
    });

    it('throws PaymentFailedException when fetch step fails', async () => {
      mockSubscription.fetch.mockRejectedValueOnce(new Error('Not found'));

      await expect(adapter.cancelSubscription('SUB_bad')).rejects.toBeInstanceOf(PaymentFailedException);
      expect(mockSubscription.disable).not.toHaveBeenCalled();
    });

    it('throws PaymentFailedException when disable step fails', async () => {
      mockSubscription.fetch.mockResolvedValueOnce({ data: { email_token: 'tok_abc' } });
      mockSubscription.disable.mockRejectedValueOnce(new Error('Disable failed'));

      await expect(adapter.cancelSubscription('SUB_test_123')).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  // ─── handleWebhookEvent ─────────────────────────────────────────────────────

  describe('handleWebhookEvent', () => {
    function makeSignature(body: Buffer): string {
      return createHmac('sha512', MOCK_SECRET).update(body).digest('hex');
    }

    const payload = { event: 'charge.success', data: { reference: 'ref-webhook-1', amount: 900000 } };

    it('returns correct WebhookEvent shape for valid signature + charge.success payload', async () => {
      const raw = Buffer.from(JSON.stringify(payload));
      const sig = makeSignature(raw);

      const result = await adapter.handleWebhookEvent(raw, sig);

      expect(result.type).toBe('charge.success');
      expect(result.reference).toBe('ref-webhook-1');
      expect(result.data).toMatchObject({ reference: 'ref-webhook-1', amount: 900000 });
    });

    it('throws UnauthorizedException for invalid signature', async () => {
      const raw = Buffer.from(JSON.stringify(payload));
      await expect(adapter.handleWebhookEvent(raw, 'deadbeef')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when payload is tampered after signing', async () => {
      const originalBody = Buffer.from(JSON.stringify(payload));
      const sig = makeSignature(originalBody);
      const tamperedBody = Buffer.from(JSON.stringify({ ...payload, event: 'charge.failed' }));

      await expect(adapter.handleWebhookEvent(tamperedBody, sig)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for empty signature string', async () => {
      const raw = Buffer.from(JSON.stringify(payload));
      await expect(adapter.handleWebhookEvent(raw, '')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when body is valid signature but malformed JSON', async () => {
      const raw = Buffer.from('not valid json{{{');
      const sig = makeSignature(raw);
      await expect(adapter.handleWebhookEvent(raw, sig)).rejects.toThrow();
    });
  });

  // ─── Security (SEC-01) ──────────────────────────────────────────────────────

  describe('SEC-01: PAYSTACK_SECRET_KEY never in logs', () => {
    it('does not include PAYSTACK_SECRET_KEY in any thrown error message', async () => {
      mockTransaction.initialize.mockRejectedValueOnce(new Error('provider error'));

      const dto = { plan: PaymentPlan.PRO, type: PaymentType.ONE_TIME };
      try {
        await adapter.initiatePayment(dto, 'u1', 'u@test.com');
      } catch (err: unknown) {
        const msg = JSON.stringify(err);
        expect(msg).not.toContain(MOCK_SECRET);
      }
    });
  });
});
