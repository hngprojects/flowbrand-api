import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { PaymentsService } from '../payments.service';
import { PaymentModelAction } from '../actions/payment.model-action';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { MockPaymentAdapter } from '../adapters/mock-payment.adapter';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { env } from '../../../config/env';

jest.mock('../../../config/env', () => ({
  env: { PAYMENT_PROVIDER: 'mock', TEST_PAYMENT_OUTCOME: 'success' },
}));

jest.mock('../constants/pricing.constants', () => ({
  PRICING: { PRO_ONETIME_KOBO: 999900, PRO_MONTHLY_KOBO: 299900, PRO_ANNUAL_KOBO: 2999900 },
}));

const mockPaymentCreate = jest.fn().mockResolvedValue({ id: 'payment-uuid' });
const mockPaymentUpdate = jest.fn().mockResolvedValue(undefined);
const mockSubscriptionCreate = jest.fn().mockResolvedValue({ id: 'sub-uuid' });
const mockSubscriptionUpdate = jest.fn().mockResolvedValue(undefined);

const PAYMENT_ACTION_MOCK: Partial<PaymentModelAction> = {
  create: mockPaymentCreate,
  update: mockPaymentUpdate,
};
const SUBSCRIPTION_ACTION_MOCK: Partial<SubscriptionModelAction> = {
  create: mockSubscriptionCreate,
  update: mockSubscriptionUpdate,
};

const MOCK_ADAPTER_MOCK: Partial<MockPaymentAdapter> = {
  initiatePayment: jest.fn().mockResolvedValue({
    reference: 'mock_ref_1',
    authorizationUrl: 'https://mock.pay/authorize',
    provider: 'mock',
  }),
  initiateSubscription: jest.fn().mockResolvedValue({
    subscriptionCode: 'mock_sub_1',
    authorizationUrl: 'https://mock.pay/sub',
    provider: 'mock',
  }),
  cancelSubscription: jest.fn().mockResolvedValue(undefined),
  verifyPayment: jest.fn().mockResolvedValue({ reference: 'ref', status: 'success', amount: 999900, currency: 'NGN' }),
};

const mockTransaction = jest.fn().mockImplementation(async (cb: (manager: unknown) => Promise<unknown>) => cb({}));
const DATA_SOURCE_MOCK = { transaction: mockTransaction };

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockSubscriptionCreate.mockResolvedValue({ id: 'sub-uuid' });
    mockPaymentCreate.mockResolvedValue({ id: 'payment-uuid' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentModelAction, useValue: PAYMENT_ACTION_MOCK },
        { provide: SubscriptionModelAction, useValue: SUBSCRIPTION_ACTION_MOCK },
        { provide: MockPaymentAdapter, useValue: MOCK_ADAPTER_MOCK },
        { provide: DataSource, useValue: DATA_SOURCE_MOCK },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is injectable via Test.createTestingModule (AC-06)', () => {
    expect(service).toBeDefined();
  });

  describe('initiatePayment', () => {
    const userId = 'user-1';
    const email = 'u@test.com';
    const dto = { plan: PaymentPlan.PRO, type: PaymentType.ONE_TIME };

    it('creates PENDING row first, then calls provider (correct operation order)', async () => {
      const order: string[] = [];
      mockPaymentCreate.mockImplementationOnce(async () => { order.push('db'); return { id: 'p-1' }; });
      (MOCK_ADAPTER_MOCK.initiatePayment as jest.Mock).mockImplementationOnce(async () => {
        order.push('provider');
        return { reference: 'r1', authorizationUrl: 'u', provider: 'mock' };
      });
      await service.initiatePayment(userId, email, dto);
      expect(order).toEqual(['db', 'provider']);
    });

    it('creates payment row with PENDING status and null provider_reference', async () => {
      await service.initiatePayment(userId, email, dto);
      const { createPayload } = mockPaymentCreate.mock.calls[0][0] as { createPayload: Record<string, unknown> };
      expect(createPayload.status).toBe(PaymentStatus.PENDING);
      expect(createPayload.provider_reference).toBeNull();
    });

    it('same inputs within the hour produce the same idempotency_key', async () => {
      await service.initiatePayment(userId, email, dto);
      await service.initiatePayment(userId, email, dto);
      const key1 = (mockPaymentCreate.mock.calls[0][0] as { createPayload: Record<string, unknown> }).createPayload.idempotency_key;
      const key2 = (mockPaymentCreate.mock.calls[1][0] as { createPayload: Record<string, unknown> }).createPayload.idempotency_key;
      expect(key1).toBe(key2);
    });

    it('updates payment row with provider_reference after provider succeeds', async () => {
      mockPaymentCreate.mockResolvedValue({ id: 'p-uuid' });
      await service.initiatePayment(userId, email, dto);
      expect(mockPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ updatePayload: { provider_reference: 'mock_ref_1' } }),
      );
    });

    it('stores amount_kobo (not naira) — 999900 for one-time PRO', async () => {
      await service.initiatePayment(userId, email, dto);
      const { createPayload } = mockPaymentCreate.mock.calls[0][0] as { createPayload: Record<string, unknown> };
      expect(createPayload.amount_kobo).toBe(999900);
    });

    it('throws ConflictException on 23505 — does not call provider (no double charge)', async () => {
      const pgError = Object.assign(new QueryFailedError('', [], new Error()), { code: '23505' });
      mockPaymentCreate.mockRejectedValueOnce(pgError);
      await expect(service.initiatePayment(userId, email, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(MOCK_ADAPTER_MOCK.initiatePayment).not.toHaveBeenCalled();
    });

    it('propagates non-idempotency DB errors before calling provider', async () => {
      mockPaymentCreate.mockRejectedValueOnce(new Error('DB down'));
      await expect(service.initiatePayment(userId, email, dto)).rejects.toThrow('DB down');
      expect(MOCK_ADAPTER_MOCK.initiatePayment).not.toHaveBeenCalled();
    });
  });

  describe('initiateSubscription', () => {
    const userId = 'user-1';
    const email = 'u@test.com';
    const dto = { plan: PaymentPlan.PRO, billingCycle: BillingCycle.MONTHLY };

    it('creates subscription with PENDING status — not ACTIVE before confirmation', async () => {
      await service.initiateSubscription(userId, email, dto);
      const { createPayload } = mockSubscriptionCreate.mock.calls[0][0] as { createPayload: Record<string, unknown> };
      expect(createPayload.status).toBe(SubscriptionStatus.PENDING);
    });

    it('links payment to subscription via subscription_id', async () => {
      await service.initiateSubscription(userId, email, dto);
      const { createPayload } = mockPaymentCreate.mock.calls[0][0] as { createPayload: Record<string, unknown> };
      expect(createPayload.subscription_id).toBe('sub-uuid');
      expect(createPayload.payment_type).toBe(PaymentType.SUBSCRIPTION);
    });

    it('uses PRO_ANNUAL_KOBO for annual billing', async () => {
      await service.initiateSubscription(userId, email, { ...dto, billingCycle: BillingCycle.ANNUAL });
      const { createPayload } = mockPaymentCreate.mock.calls[0][0] as { createPayload: Record<string, unknown> };
      expect(createPayload.amount_kobo).toBe(2999900);
    });

    it('wraps both creates in a single transaction', async () => {
      await service.initiateSubscription(userId, email, dto);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException on 23505 — active subscription already exists', async () => {
      const pgError = Object.assign(new QueryFailedError('', [], new Error()), { code: '23505' });
      mockTransaction.mockRejectedValueOnce(pgError);
      await expect(service.initiateSubscription(userId, email, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(MOCK_ADAPTER_MOCK.initiateSubscription).not.toHaveBeenCalled();
    });

    it('propagates non-idempotency transaction errors without calling provider', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('Transaction failed'));
      await expect(service.initiateSubscription(userId, email, dto)).rejects.toThrow('Transaction failed');
      expect(MOCK_ADAPTER_MOCK.initiateSubscription).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeMetadata (SEC-04)', () => {
    it('strips PII fields from real provider data, preserves non-PII', () => {
      const raw = { card_number: '4111111111111111', cvv: '123', pan: 'xxx', pin: '1234', amount: 100, note: 'test' };
      const clean = (service as unknown as { sanitizeMetadata: (r: Record<string, unknown>) => Record<string, unknown> }).sanitizeMetadata(raw);
      expect(clean).not.toHaveProperty('card_number');
      expect(clean).not.toHaveProperty('cvv');
      expect(clean).not.toHaveProperty('pan');
      expect(clean).not.toHaveProperty('pin');
      expect(clean).toHaveProperty('amount', 100);
      expect(clean).toHaveProperty('note', 'test');
    });
  });

  describe('resolveAdapter', () => {
    it('throws on known-but-unimplemented provider at construction time', () => {
      (env as { PAYMENT_PROVIDER: string }).PAYMENT_PROVIDER = 'paystack';
      expect(
        () =>
          new PaymentsService(
            PAYMENT_ACTION_MOCK as PaymentModelAction,
            SUBSCRIPTION_ACTION_MOCK as SubscriptionModelAction,
            MOCK_ADAPTER_MOCK as MockPaymentAdapter,
            DATA_SOURCE_MOCK as unknown as DataSource,
          ),
      ).toThrow('Payment provider is not yet implemented');
      (env as { PAYMENT_PROVIDER: string }).PAYMENT_PROVIDER = 'mock';
    });
  });
});
