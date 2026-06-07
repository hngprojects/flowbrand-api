import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { PlanUpgradedEvent } from '../../../common/events/events';
import { PaymentsService } from '../payments.service';
import { PaymentModelAction } from '../actions/payment.model-action';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { MockPaymentAdapter } from '../adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from '../adapters/paystack-payment.adapter';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

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
const mockSubscriptionFind = jest.fn().mockResolvedValue({ payload: [], paginationMeta: {} });
const mockSubscriptionList = jest.fn().mockResolvedValue({ payload: [], paginationMeta: {} });
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
  find: mockSubscriptionFind,
  list: mockSubscriptionList,
};

const STUB_ADAPTER = {
  initiatePayment: jest.fn(),
  initiateSubscription: jest.fn(),
  verifyPayment: jest.fn(),
  cancelSubscription: jest.fn(),
  handleWebhookEvent: jest.fn(),
};

describe('PaymentsService — resolvePayment', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

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

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── AC-01: DB short-circuit ────────────────────────────────────────────────

  it('returns success from DB without gateway call when payment is already SUCCESS', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.SUCCESS,
      provider_reference: REF, amount_kobo: 900000,
      card_last4: '1234', card_brand: 'visa', payment_type: PaymentType.ONE_TIME,
    });
    const verifySpy = jest.spyOn(service, 'verifyPayment');

    const result = await service.resolvePayment(USER_ID, REF);

    expect(verifySpy).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.SUCCESS);
    expect(result.plan).toBe(PaymentPlan.PRO);
    expect(result.reference).toBe(REF);
  });

  it('short-circuits on FAILED status without gateway call', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.FAILED,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    const verifySpy = jest.spyOn(service, 'verifyPayment');

    const result = await service.resolvePayment(USER_ID, REF);

    expect(verifySpy).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.FAILED);
  });

  // ─── AC-02: gateway confirms SUCCESS ─────────────────────────────────────────

  it('ONE_TIME: updates payment to SUCCESS and creates ACTIVE subscription on gateway confirm', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 900000, currency: 'NGN',
      cardLast4: '0000', cardBrand: 'mastercard',
    });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updatePayload: expect.objectContaining({ status: PaymentStatus.SUCCESS }) }),
    );
    expect(mockSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ createPayload: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }) }),
    );
    expect(result.status).toBe(PaymentStatus.SUCCESS);
    expect(result.cardLast4).toBe('0000');
  });

  it('SUBSCRIPTION: updates PENDING row to ACTIVE (does not create a new row)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-2', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 300000, payment_type: PaymentType.SUBSCRIPTION,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 300000, currency: 'NGN',
    });
    mockSubscriptionFind.mockResolvedValueOnce({
      payload: [{ id: 'sub-pending', billing_cycle: BillingCycle.MONTHLY, status: SubscriptionStatus.PENDING }],
      paginationMeta: {},
    });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        identifierOptions: { id: 'sub-pending' },
        updatePayload: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          current_period_start: expect.any(Date),
          current_period_end: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(PaymentStatus.SUCCESS);
  });

  it('emits PLAN_UPGRADED after the transaction commits, not before', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 900000, currency: 'NGN',
    });

    await service.resolvePayment(USER_ID, REF);

    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PLAN_UPGRADED, expect.any(PlanUpgradedEvent));
    const txOrder = mockTransaction.mock.invocationCallOrder[0];
    const emitOrder = mockEmit.mock.invocationCallOrder[0];
    expect(emitOrder).toBeGreaterThan(txOrder);
  });

  // ─── AC-03: gateway reports FAILED ───────────────────────────────────────────

  it('updates payment to FAILED without touching subscription on gateway failure', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.FAILED, amount: 0, currency: 'NGN',
    });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updatePayload: { status: PaymentStatus.FAILED } }),
    );
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.FAILED);
  });

  // ─── AC-04: gateway reports PENDING ──────────────────────────────────────────

  it('returns PENDING without any DB write when gateway reports PENDING', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.PENDING, amount: 0, currency: 'NGN',
    });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockPaymentUpdate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.PENDING);
  });

  // ─── AC-05 / AC-06: not found or wrong user ───────────────────────────────────

  it('throws NotFoundException when payment does not exist', async () => {
    mockPaymentGet.mockResolvedValueOnce(null);
    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when payment belongs to a different user (SEC-01)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: 'other-user', status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not call the gateway when the ownership check fails (SEC-01 order guarantee)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: 'other-user', status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    const verifySpy = jest.spyOn(service, 'verifyPayment');

    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBeInstanceOf(NotFoundException);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  // ─── AC-08: transaction failure ───────────────────────────────────────────────

  it('propagates transaction error without committing payment update or emitting event', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 900000, currency: 'NGN',
    });
    mockTransaction.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.resolvePayment(USER_ID, REF)).rejects.toThrow('DB connection lost');
    // callback never ran inside the rejected mock — no DB writes committed
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  // ─── SEC-05: amount mismatch → 422 before any DB write ───────────────────────

  it('throws UnprocessableEntityException when gateway amount differs from stored amount (SEC-05)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 500000, currency: 'NGN',
    });

    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ─── EC-02: idempotency guard ─────────────────────────────────────────────────

  it('ONE_TIME: idempotent skip when ACTIVE subscription already exists (EC-02)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 900000, currency: 'NGN',
    });
    // Pre-check finds ACTIVE — already done, skip both INSERT and UPDATE
    mockSubscriptionList.mockResolvedValueOnce({
      payload: [{ id: 'sub-existing', status: SubscriptionStatus.ACTIVE, plan: PaymentPlan.PRO }],
      paginationMeta: {},
    });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.SUCCESS);
    // Already active — PLAN_UPGRADED event still fires
    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PLAN_UPGRADED, expect.any(PlanUpgradedEvent));
  });

  it('ONE_TIME: upgrades PENDING subscription to ACTIVE MONTHLY when pre-check finds existing PENDING row (EC-02b)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 900000, currency: 'NGN',
    });
    // Pre-check finds PENDING monthly — can't INSERT (unique index), must UPDATE in-place
    mockSubscriptionList.mockResolvedValueOnce({
      payload: [{ id: 'sub-pending', status: SubscriptionStatus.PENDING, billing_cycle: BillingCycle.MONTHLY }],
      paginationMeta: {},
    });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        identifierOptions: { id: 'sub-pending' },
        updatePayload: expect.objectContaining({
          plan: PaymentPlan.PRO,
          billing_cycle: BillingCycle.MONTHLY,
          status: SubscriptionStatus.ACTIVE,
        }),
      }),
    );
    expect(result.status).toBe(PaymentStatus.SUCCESS);
    expect(mockEmit).toHaveBeenCalledWith(APP_EVENTS.PLAN_UPGRADED, expect.any(PlanUpgradedEvent));
  });

  it('SUBSCRIPTION: warns and does not emit PLAN_UPGRADED when no PENDING row found (EC-02)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-2', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 300000, payment_type: PaymentType.SUBSCRIPTION,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 300000, currency: 'NGN',
    });
    mockSubscriptionFind.mockResolvedValueOnce({ payload: [], paginationMeta: {} });

    const result = await service.resolvePayment(USER_ID, REF);

    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.SUCCESS);
  });

  // ─── EC-03: gateway errors ────────────────────────────────────────────────────

  it('maps AbortError to GatewayTimeoutException (EC-03)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    jest.spyOn(service, 'verifyPayment').mockRejectedValueOnce(abortErr);

    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('maps non-AbortError gateway error to BadGatewayException', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockRejectedValueOnce(new Error('Network error'));

    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('re-throws HttpException from gateway without wrapping it', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    const httpErr = new NotFoundException('adapter-level 404');
    jest.spyOn(service, 'verifyPayment').mockRejectedValueOnce(httpErr);

    await expect(service.resolvePayment(USER_ID, REF)).rejects.toBe(httpErr);
  });

  // ─── SEC-04: PlanUpgradedEvent has no PII ────────────────────────────────────

  it('PlanUpgradedEvent payload contains only userId, plan, and reference — no email or card data (SEC-04)', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      id: 'p-1', user_id: USER_ID, status: PaymentStatus.PENDING,
      provider_reference: REF, amount_kobo: 900000, payment_type: PaymentType.ONE_TIME,
    });
    jest.spyOn(service, 'verifyPayment').mockResolvedValueOnce({
      reference: REF, status: PaymentStatus.SUCCESS, amount: 900000, currency: 'NGN',
      cardLast4: '1234', cardBrand: 'visa',
    });

    await service.resolvePayment(USER_ID, REF);

    const emittedEvent: PlanUpgradedEvent = mockEmit.mock.calls[0][1];
    expect(emittedEvent).not.toHaveProperty('email');
    expect(emittedEvent).not.toHaveProperty('cardLast4');
    expect(emittedEvent).not.toHaveProperty('amount');
    expect(emittedEvent.userId).toBe(USER_ID);
    expect(emittedEvent.plan).toBe(PaymentPlan.PRO);
    expect(emittedEvent.reference).toBe(REF);
  });
});
