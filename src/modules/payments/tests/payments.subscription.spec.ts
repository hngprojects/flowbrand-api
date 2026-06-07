import {
  BadGatewayException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { SubscriptionCancelledEvent } from '../../../common/events/events';
import { PaymentModelAction } from '../actions/payment.model-action';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { MockPaymentAdapter } from '../adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from '../adapters/paystack-payment.adapter';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
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

const ACTIVE_SUB = {
  id: 'sub-1',
  user_id: USER_ID,
  plan: PaymentPlan.PRO,
  billing_cycle: BillingCycle.MONTHLY,
  status: SubscriptionStatus.ACTIVE,
  provider_subscription_code: 'SUB_abc',
  current_period_start: new Date('2026-06-01'),
  current_period_end: new Date('2026-07-01'),
  cancel_at_period_end: false,
  cancelled_at: null,
  ended_at: null,
};

const mockSubscriptionList = jest.fn();
const mockSubscriptionUpdate = jest.fn().mockResolvedValue(undefined);
const mockEmit = jest.fn();

const SUBSCRIPTION_ACTION_MOCK: Partial<SubscriptionModelAction> = {
  list: mockSubscriptionList,
  update: mockSubscriptionUpdate,
};

const STUB_ADAPTER = {
  initiatePayment: jest.fn(),
  initiateSubscription: jest.fn(),
  verifyPayment: jest.fn(),
  cancelSubscription: jest.fn(),
  handleWebhookEvent: jest.fn(),
};

describe('PaymentsService — subscription management', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentModelAction, useValue: { get: jest.fn(), update: jest.fn() } },
        { provide: SubscriptionModelAction, useValue: SUBSCRIPTION_ACTION_MOCK },
        { provide: MockPaymentAdapter, useValue: STUB_ADAPTER },
        { provide: PaystackPaymentAdapter, useValue: STUB_ADAPTER },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: mockEmit } },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getUserSubscription ────────────────────────────────────────────────────

  describe('getUserSubscription', () => {
    it('AC-01: returns full subscription response for an active subscription', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });

      const result = await service.getUserSubscription(USER_ID);

      expect(result.subscriptionId).toBe('sub-1');
      expect(result.plan).toBe(PaymentPlan.PRO);
      expect(result.billingCycle).toBe(BillingCycle.MONTHLY);
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.currentPeriodStart).toBe(ACTIVE_SUB.current_period_start.toISOString());
      expect(result.currentPeriodEnd).toBe(ACTIVE_SUB.current_period_end.toISOString());
      expect(result.cancelledAt).toBeNull();
      expect(result.downgradeAt).toBeNull();
    });

    it('AC-01: downgradeAt is derived from current_period_end when cancel_at_period_end is true', async () => {
      const cancelledSub = { ...ACTIVE_SUB, cancel_at_period_end: true, cancelled_at: new Date() };
      mockSubscriptionList.mockResolvedValueOnce({ payload: [cancelledSub], paginationMeta: {} });

      const result = await service.getUserSubscription(USER_ID);

      expect(result.downgradeAt).toBe(ACTIVE_SUB.current_period_end.toISOString());
    });

    it('AC-02: throws NotFoundException when no active subscription exists', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [], paginationMeta: {} });

      await expect(service.getUserSubscription(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('SEC-02: response does not include provider_subscription_code or provider_customer_code', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });

      const result = await service.getUserSubscription(USER_ID);

      expect(result).not.toHaveProperty('provider_subscription_code');
      expect(result).not.toHaveProperty('provider_customer_code');
    });
  });

  // ─── cancelUserSubscription ─────────────────────────────────────────────────

  describe('cancelUserSubscription', () => {
    it('AC-03/04/05: cancels active subscription — correct DB update fields', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });
      jest.spyOn(service, 'cancelSubscription').mockResolvedValueOnce(undefined);

      const result = await service.cancelUserSubscription(USER_ID);

      expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          updatePayload: expect.objectContaining({
            status: SubscriptionStatus.CANCELLED,
            cancel_at_period_end: true,
            cancelled_at: expect.any(Date),
          }),
        }),
      );
      expect(result.accessUntil).toBe(ACTIVE_SUB.current_period_end.toISOString());
      expect(result.cancelledAt).toBeTruthy();
    });

    it('AC-05: current_period_end is not mutated in the update payload', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });
      jest.spyOn(service, 'cancelSubscription').mockResolvedValueOnce(undefined);

      await service.cancelUserSubscription(USER_ID);

      const updatePayload = mockSubscriptionUpdate.mock.calls[0][0].updatePayload;
      expect(updatePayload).not.toHaveProperty('current_period_end');
      expect(updatePayload).not.toHaveProperty('ended_at');
    });

    it('AC-06: throws NotFoundException when no subscription exists (active or historical)', async () => {
      mockSubscriptionList.mockResolvedValue({ payload: [], paginationMeta: {} });

      await expect(service.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('AC-07: throws ConflictException when subscription is already cancelled', async () => {
      mockSubscriptionList
        .mockResolvedValueOnce({ payload: [], paginationMeta: {} })
        .mockResolvedValueOnce({ payload: [{ ...ACTIVE_SUB, status: SubscriptionStatus.CANCELLED }], paginationMeta: {} });

      await expect(service.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    });

    it('AC-07: throws ConflictException when subscription is expired', async () => {
      mockSubscriptionList
        .mockResolvedValueOnce({ payload: [], paginationMeta: {} })
        .mockResolvedValueOnce({ payload: [{ ...ACTIVE_SUB, status: SubscriptionStatus.EXPIRED }], paginationMeta: {} });

      await expect(service.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('AC-07: returns 404 (not 409) when user only has a PENDING subscription', async () => {
      mockSubscriptionList
        .mockResolvedValueOnce({ payload: [], paginationMeta: {} })
        .mockResolvedValueOnce({ payload: [], paginationMeta: {} });

      await expect(service.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('AC-08: throws BadGatewayException on provider error — DB row unchanged', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });
      jest.spyOn(service, 'cancelSubscription').mockRejectedValueOnce(new Error('Paystack unreachable'));

      await expect(service.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(BadGatewayException);
      expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    });

    it('AC-08b: propagates PaymentFailedException (402) unchanged — not wrapped as BadGatewayException', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });
      jest.spyOn(service, 'cancelSubscription').mockRejectedValueOnce(new PaymentFailedException('declined'));

      const thrown = await service.cancelUserSubscription(USER_ID).catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(PaymentFailedException);
      expect(thrown).not.toBeInstanceOf(BadGatewayException);
      expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    });

    it('AC-09: emits SUBSCRIPTION_CANCELLED event after successful DB update', async () => {
      mockSubscriptionList.mockResolvedValueOnce({ payload: [ACTIVE_SUB], paginationMeta: {} });
      jest.spyOn(service, 'cancelSubscription').mockResolvedValueOnce(undefined);

      await service.cancelUserSubscription(USER_ID);

      expect(mockEmit).toHaveBeenCalledWith(
        APP_EVENTS.SUBSCRIPTION_CANCELLED,
        expect.objectContaining({ userId: USER_ID, subscriptionId: 'sub-1' }),
      );
      const emittedEvent: SubscriptionCancelledEvent = mockEmit.mock.calls[0][1];
      expect(emittedEvent.accessUntil).toEqual(ACTIVE_SUB.current_period_end);
    });

    it('EC-03: throws InternalServerErrorException when provider_subscription_code is null', async () => {
      const subWithoutCode = { ...ACTIVE_SUB, provider_subscription_code: null };
      mockSubscriptionList.mockResolvedValueOnce({ payload: [subWithoutCode], paginationMeta: {} });

      await expect(service.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    });
  });
});
