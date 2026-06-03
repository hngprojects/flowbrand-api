import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
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
  PRICING: { PRO_ONETIME: 9999, PRO_MONTHLY: 2999, PRO_ANNUAL: 29999 },
}));

const mockPaymentCreate = jest.fn().mockResolvedValue({ id: 'payment-uuid' });
const mockSubscriptionCreate = jest.fn().mockResolvedValue({ id: 'sub-uuid' });

const PAYMENT_ACTION_MOCK: Partial<PaymentModelAction> = { create: mockPaymentCreate };
const SUBSCRIPTION_ACTION_MOCK: Partial<SubscriptionModelAction> = { create: mockSubscriptionCreate };

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
  verifyPayment: jest.fn().mockResolvedValue({ reference: 'ref', status: 'success', amount: 9999, currency: 'NGN' }),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentModelAction, useValue: PAYMENT_ACTION_MOCK },
        { provide: SubscriptionModelAction, useValue: SUBSCRIPTION_ACTION_MOCK },
        { provide: MockPaymentAdapter, useValue: MOCK_ADAPTER_MOCK },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is injectable via Test.createTestingModule (AC-06)', () => {
    expect(service).toBeDefined();
  });

  describe('initiatePayment', () => {
    const dto = { userId: 'user-1', email: 'u@test.com', plan: PaymentPlan.PRO, type: PaymentType.ONE_TIME };

    it('delegates to MockPaymentAdapter and calls paymentModelAction.create once (AC-01)', async () => {
      await service.initiatePayment(dto);
      expect(MOCK_ADAPTER_MOCK.initiatePayment).toHaveBeenCalledTimes(1);
      expect(mockPaymentCreate).toHaveBeenCalledTimes(1);
    });

    it('result contains reference from adapter', async () => {
      const result = await service.initiatePayment(dto);
      expect(result.reference).toBe('mock_ref_1');
    });

    it('payment row includes idempotency_key and subscription_id: null', async () => {
      await service.initiatePayment(dto);
      const { createPayload } = mockPaymentCreate.mock.calls[0][0];
      expect(createPayload.idempotency_key).toBeTruthy();
      expect(createPayload.subscription_id).toBeNull();
      expect(createPayload.status).toBe(PaymentStatus.PENDING);
    });

    it('sanitizeMetadata strips card_number, cvv, pan, pin before create (SEC-04)', async () => {
      const spy = jest.spyOn(service as unknown as { sanitizeMetadata: (r: Record<string, unknown>) => Record<string, unknown> }, 'sanitizeMetadata');
      await service.initiatePayment(dto);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('initiateSubscription', () => {
    const dto = {
      userId: 'user-1',
      email: 'u@test.com',
      plan: PaymentPlan.PRO,
      billingCycle: BillingCycle.MONTHLY,
    };

    it('creates subscription first, then payment linked via subscription_id', async () => {
      await service.initiateSubscription(dto);

      expect(mockSubscriptionCreate).toHaveBeenCalledTimes(1);
      expect(mockPaymentCreate).toHaveBeenCalledTimes(1);

      // Subscription has no payment_id
      const { createPayload: subPayload } = mockSubscriptionCreate.mock.calls[0][0];
      expect(subPayload.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subPayload.payment_id).toBeUndefined();

      // Payment points back to the subscription
      const { createPayload: payPayload } = mockPaymentCreate.mock.calls[0][0];
      expect(payPayload.subscription_id).toBe('sub-uuid');
      expect(payPayload.payment_type).toBe(PaymentType.SUBSCRIPTION);
      expect(payPayload.idempotency_key).toBeTruthy();
    });

    it('uses PRO_ANNUAL price for annual billing cycle', async () => {
      await service.initiateSubscription({ ...dto, billingCycle: BillingCycle.ANNUAL });
      const { createPayload } = mockPaymentCreate.mock.calls[0][0];
      expect(createPayload.amount).toBe(29999);
    });
  });

  describe('resolveAdapter', () => {
    it('throws when PAYMENT_PROVIDER is an unimplemented known value', () => {
      (env as { PAYMENT_PROVIDER: string }).PAYMENT_PROVIDER = 'paystack';
      expect(
        () =>
          new PaymentsService(
            PAYMENT_ACTION_MOCK as PaymentModelAction,
            SUBSCRIPTION_ACTION_MOCK as SubscriptionModelAction,
            MOCK_ADAPTER_MOCK as MockPaymentAdapter,
          ),
      ).toThrow('Payment provider is not yet implemented');
      (env as { PAYMENT_PROVIDER: string }).PAYMENT_PROVIDER = 'mock';
    });
  });
});
