import { Logger, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { PaymentFailedEvent, PlanUpgradedEvent } from '../../../common/events/events';
import * as SYS_MSG from '../../../constants/system.messages';
import { PaymentModelAction } from '../actions/payment.model-action';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { MockPaymentAdapter } from '../adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from '../adapters/paystack-payment.adapter';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { PaymentsService } from '../payments.service';

jest.mock('../../../config/env', () => ({
  env: {
    PAYMENT_PROVIDER: 'mock',
    TEST_PAYMENT_OUTCOME: 'success',
    PAYSTACK_SECRET_KEY: 'sk_test_placeholder',
    PAYSTACK_PRO_MONTHLY_PLAN_CODE: 'PLN_monthly',
    PAYSTACK_PRO_ANNUAL_PLAN_CODE: 'PLN_annual',
  },
}));

jest.mock('../constants/pricing.constants', () => ({
  PRICING: { PRO_ONETIME_KOBO: 900000, PRO_MONTHLY_KOBO: 300000, PRO_ANNUAL_KOBO: 3200000 },
}));

const USER_ID = 'user-uuid-1';
const REF = '550e8400-e29b-41d4-a716-446655440000';

const mockPaymentGet = jest.fn();
const mockPaymentUpdate = jest.fn().mockResolvedValue(undefined);
const mockSubscriptionCreate = jest.fn().mockResolvedValue({ id: 'sub-1' });
const mockSubscriptionUpdate = jest.fn().mockResolvedValue(undefined);
const mockSubscriptionList = jest.fn().mockResolvedValue({ payload: [], paginationMeta: {} });
const mockSubscriptionFind = jest.fn().mockResolvedValue({ payload: [], paginationMeta: {} });
const mockEmit = jest.fn();
const mockTransaction = jest
  .fn()
  .mockImplementation(async (cb: (manager: unknown) => Promise<unknown>) => cb({}));

const PAYMENT_ACTION_MOCK: Partial<PaymentModelAction> = {
  get: mockPaymentGet,
  update: mockPaymentUpdate,
};
const SUBSCRIPTION_ACTION_MOCK: Partial<SubscriptionModelAction> = {
  create: mockSubscriptionCreate,
  update: mockSubscriptionUpdate,
  list: mockSubscriptionList,
  find: mockSubscriptionFind,
};

const STUB_ADAPTER = {
  initiatePayment: jest.fn(),
  initiateSubscription: jest.fn(),
  verifyPayment: jest.fn(),
  cancelSubscription: jest.fn(),
  handleWebhookEvent: jest.fn(),
};

describe('PaymentsService — processWebhookEvent', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentModelAction, useValue: PAYMENT_ACTION_MOCK },
        { provide: SubscriptionModelAction, useValue: SUBSCRIPTION_ACTION_MOCK },
        { provide: MockPaymentAdapter, useValue: STUB_ADAPTER },
        { provide: PaystackPaymentAdapter, useValue: STUB_ADAPTER },
        { provide: DataSource, useValue: { transaction: mockTransaction } },
        { provide: EventEmitter2, useValue: { emit: mockEmit } },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockSubscriptionCreate.mockResolvedValue({ id: 'sub-1' });
    mockSubscriptionList.mockResolvedValue({ payload: [], paginationMeta: {} });
    mockSubscriptionFind.mockResolvedValue({ payload: [], paginationMeta: {} });
  });

  // AC-03 — Invalid signature → 401, no DB writes
  it('throws UnauthorizedException on invalid signature — no DB calls made', async () => {
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockRejectedValueOnce(new UnauthorizedException(SYS_MSG.WEBHOOK_SIGNATURE_INVALID));

    await expect(service.processWebhookEvent(Buffer.from('{}'), 'bad_sig')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(mockPaymentGet).not.toHaveBeenCalled();
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  // AC-01 — charge.success → payment updated to success, Pro subscription created
  it('processes charge.success: marks payment success and creates Pro subscription', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    expect(mockPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        updatePayload: expect.objectContaining({ status: PaymentStatus.SUCCESS }),
      }),
    );
    expect(mockSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        createPayload: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      }),
    );
    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PLAN_UPGRADED, expect.any(PlanUpgradedEvent));
  });

  // AC-02 — charge.failed → payment updated to failed, no subscription created
  it('processes charge.failed: marks payment failed without creating subscription', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      provider_reference: REF,
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.failed', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    expect(mockPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updatePayload: { status: PaymentStatus.FAILED } }),
    );
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PAYMENT_FAILED, expect.any(PaymentFailedEvent));
  });

  // AC-04 — charge.success replayed (already success) → no-op
  it('skips charge.success when payment is already terminal (idempotent replay)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.SUCCESS,
      provider_reference: REF,
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    expect(mockPaymentUpdate).not.toHaveBeenCalled();
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  // AC-05 — Reference not found in DB → warning logged, resolves without error
  it('logs warning and returns when payment reference is not found (EC-02)', async () => {
    mockPaymentGet.mockResolvedValueOnce(null);
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: 'unknown-ref', data: {} });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    await expect(service.processWebhookEvent(Buffer.from('{}'), 'sig')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('not found') }),
    );
  });

  // AC-09 — PLAN_UPGRADED event emitted after transaction, not before
  it('emits PLAN_UPGRADED after transaction commits', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    const txOrder = mockTransaction.mock.invocationCallOrder[0];
    const emitOrder = mockEmit.mock.invocationCallOrder[0];
    expect(emitOrder).toBeGreaterThan(txOrder);
  });

  // AC-10 — subscription.disable immediately sets CANCELLED
  it('processes subscription.disable: sets status to CANCELLED', async () => {
    const SUB_CODE = 'SUB_abc123';
    mockSubscriptionList.mockResolvedValueOnce({
      payload: [{ id: 'sub-1', user_id: USER_ID, status: SubscriptionStatus.ACTIVE, provider_subscription_code: SUB_CODE }],
      paginationMeta: {},
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'subscription.disable', reference: SUB_CODE, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        updatePayload: expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
          cancel_at_period_end: false,
        }),
      }),
    );
  });

  // AC-10 — subscription.not_renew sets cancel_at_period_end, status stays ACTIVE
  it('processes subscription.not_renew: sets cancel_at_period_end=true, status stays ACTIVE', async () => {
    const SUB_CODE = 'SUB_abc123';
    mockSubscriptionList.mockResolvedValueOnce({
      payload: [{ id: 'sub-1', user_id: USER_ID, status: SubscriptionStatus.ACTIVE, provider_subscription_code: SUB_CODE }],
      paginationMeta: {},
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'subscription.not_renew', reference: SUB_CODE, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    const updatePayload = mockSubscriptionUpdate.mock.calls[0][0].updatePayload;
    expect(updatePayload.cancel_at_period_end).toBe(true);
    expect(updatePayload).not.toHaveProperty('status');
  });

  // AC-11 — concurrent activation race: second request finds ACTIVE subscription, skips both INSERT and UPDATE
  it('handles concurrent activation race on charge.success — idempotent skip, event still emits', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    // First request already created ACTIVE subscription; second request finds it and skips
    mockSubscriptionList.mockResolvedValueOnce({
      payload: [{ id: 'sub-existing', status: SubscriptionStatus.ACTIVE, billing_cycle: BillingCycle.MONTHLY }],
      paginationMeta: {},
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PLAN_UPGRADED, expect.any(PlanUpgradedEvent));
  });

  // EC-03 — DB failure after valid signature → logs error, resolves without throwing
  it('catches and logs DB errors after valid signature — resolves without throwing (EC-03)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });
    mockTransaction.mockRejectedValueOnce(new Error('DB timeout'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    await expect(service.processWebhookEvent(Buffer.from('{}'), 'sig')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: SYS_MSG.WEBHOOK_PROCESSING_ERROR }),
    );
  });

  // SEC-05 — only card_last4 and card_brand written from authorization data
  it('stores only card_last4 and card_brand — no full card number or CVV', async () => {
    const cardData = { last4: '9999', brand: 'visa', number: '4111111111119999', cvv: '000' };
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    jest.spyOn(service, 'handleWebhookEvent').mockResolvedValueOnce({
      type: 'charge.success',
      reference: REF,
      data: { authorization: cardData },
    });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    const updatePayload = mockPaymentUpdate.mock.calls[0][0].updatePayload;
    expect(updatePayload.card_last4).toBe('9999');
    expect(updatePayload.card_brand).toBe('visa');
    expect(updatePayload).not.toHaveProperty('number');
    expect(updatePayload).not.toHaveProperty('cvv');
  });

  // Amount mismatch — logs error and returns without activating Pro
  it('aborts on amount mismatch — no DB write, no subscription created', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    jest.spyOn(service, 'handleWebhookEvent').mockResolvedValueOnce({
      type: 'charge.success',
      reference: REF,
      data: { amount: 1 },
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: SYS_MSG.PAYMENT_AMOUNT_MISMATCH }),
    );
  });

  // Subscription path — charge.success with SUBSCRIPTION payment type uses activateSubscriptionPayment
  it('activates subscription payment type via activateSubscriptionPayment (not activateProSubscription)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.SUBSCRIPTION,
      amount_kobo: 300000,
      provider_reference: REF,
    });
    mockSubscriptionFind.mockResolvedValueOnce({
      payload: [{ id: 'sub-pending', billing_cycle: 'monthly', status: SubscriptionStatus.PENDING }],
      paginationMeta: {},
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    // activateSubscriptionPayment calls subscriptionModelAction.update (not create)
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        updatePayload: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      }),
    );
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PLAN_UPGRADED, expect.any(PlanUpgradedEvent));
  });

  // Emitted PlanUpgradedEvent carries the correct userId, plan, and reference
  it('emits PlanUpgradedEvent with correct userId, plan, and reference', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1',
      user_id: USER_ID,
      status: PaymentStatus.PENDING,
      payment_type: PaymentType.ONE_TIME,
      amount_kobo: 900000,
      provider_reference: REF,
    });
    jest
      .spyOn(service, 'handleWebhookEvent')
      .mockResolvedValueOnce({ type: 'charge.success', reference: REF, data: {} });

    await service.processWebhookEvent(Buffer.from('{}'), 'sig');

    const emittedEvent = mockEmit.mock.calls[0][1] as PlanUpgradedEvent;
    expect(emittedEvent.userId).toBe(USER_ID);
    expect(emittedEvent.plan).toBe(PaymentPlan.PRO);
    expect(emittedEvent.reference).toBe(REF);
  });
});
