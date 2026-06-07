import { BadGatewayException, ConflictException, ExecutionContext, HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';
import { PaymentRateLimitGuard } from '../guards/payment-rate-limit.guard';
import { SubscriptionRateLimitGuard } from '../guards/subscription-rate-limit.guard';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { RedisService } from '../../redis/redis.service';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import { HttpException } from '@nestjs/common';

jest.mock('../constants/pricing.constants', () => ({
  PRICING: { PRO_ONETIME_KOBO: 900000, PRO_MONTHLY_KOBO: 300000, PRO_ANNUAL_KOBO: 3200000 },
}));

const USER_ID = 'user-uuid-1';
const EMAIL = 'user@test.com';

const SERVICE_MOCK = {
  initiatePayment: jest.fn().mockResolvedValue({
    reference: 'ref-1',
    authorizationUrl: 'https://checkout.paystack.com/test',
    provider: 'mock',
  }),
  initiateSubscription: jest.fn().mockResolvedValue({
    subscriptionCode: 'acc_code_xyz',
    authorizationUrl: 'https://checkout.paystack.com/sub-test',
    provider: 'mock',
  }),
};

const RATE_LIMIT_GUARD_MOCK = { canActivate: jest.fn().mockResolvedValue(true) };
const SUBSCRIPTION_RATE_LIMIT_GUARD_MOCK = { canActivate: jest.fn().mockResolvedValue(true) };

const SUBSCRIPTION_ACTION_MOCK = {
  list: jest.fn().mockResolvedValue({ payload: [], paginationMeta: {} }),
};

const REDIS_SERVICE_MOCK = {
  rateLimit: jest.fn().mockResolvedValue({ count: 1, exceeded: false }),
};

// Build a minimal ExecutionContext pointing at a mock request
function buildContext(userId = USER_ID): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId, email: EMAIL } }),
    }),
  } as unknown as ExecutionContext;
}

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: SERVICE_MOCK },
      ],
    })
      .overrideGuard(PaymentRateLimitGuard)
      .useValue(RATE_LIMIT_GUARD_MOCK)
      .overrideGuard(SubscriptionRateLimitGuard)
      .useValue(SUBSCRIPTION_RATE_LIMIT_GUARD_MOCK)
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  // AC-01 — happy path
  it('returns 201 with reference, authorizationUrl, amount, currency', async () => {
    const result = await controller.initiate(USER_ID, EMAIL);
    expect(result.statusCode).toBe(HttpStatus.CREATED);
    expect(result.data.reference).toBe('ref-1');
    expect(result.data.authorizationUrl).toBe('https://checkout.paystack.com/test');
    expect(typeof result.data.amount).toBe('number');
    expect(result.data.currency).toBe('NGN');
  });

  // SEC-01 — amount always from PRICING, never from request
  it('uses PRICING.PRO_ONETIME_KOBO for amount — never a client-supplied value', async () => {
    const result = await controller.initiate(USER_ID, EMAIL);
    expect(result.data.amount).toBe(900000);
  });

  // AC-02 — authorizationUrl returned opaque
  it('returns authorizationUrl unchanged from service result', async () => {
    const result = await controller.initiate(USER_ID, EMAIL);
    expect(result.data.authorizationUrl).toBe('https://checkout.paystack.com/test');
  });

  // AC-04 — idempotent retry
  it('succeeds twice — idempotency is handled by PaymentsService (018c)', async () => {
    await controller.initiate(USER_ID, EMAIL);
    await controller.initiate(USER_ID, EMAIL);
    expect(SERVICE_MOCK.initiatePayment).toHaveBeenCalledTimes(2);
  });

  // AC-06 — non-HttpException → 502
  it('maps non-HttpException provider errors to BadGatewayException (502)', async () => {
    SERVICE_MOCK.initiatePayment.mockRejectedValueOnce(new Error('Network timeout'));
    await expect(controller.initiate(USER_ID, EMAIL)).rejects.toBeInstanceOf(BadGatewayException);
  });

  // AC-06 — ConflictException passes through unchanged
  it('does not wrap ConflictException (409 idempotency passes through)', async () => {
    SERVICE_MOCK.initiatePayment.mockRejectedValueOnce(new ConflictException('already in progress'));
    await expect(controller.initiate(USER_ID, EMAIL)).rejects.toBeInstanceOf(ConflictException);
  });

  // AC-06 — PaymentFailedException (402) passes through unchanged
  it('does not wrap PaymentFailedException (402 passes through as HttpException, not BadGatewayException)', async () => {
    const err = new PaymentFailedException('declined');
    SERVICE_MOCK.initiatePayment.mockRejectedValueOnce(err);
    const thrown = await controller.initiate(USER_ID, EMAIL).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown).not.toBeInstanceOf(BadGatewayException);
  });

  // AC-07 — 401 is enforced by the global AuthGuard — tested at the e2e layer
});

describe('PaymentsController — POST /payments/subscriptions/initiate', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: SERVICE_MOCK }],
    })
      .overrideGuard(PaymentRateLimitGuard)
      .useValue(RATE_LIMIT_GUARD_MOCK)
      .overrideGuard(SubscriptionRateLimitGuard)
      .useValue(SUBSCRIPTION_RATE_LIMIT_GUARD_MOCK)
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('returns 201 with authorizationUrl, amount, currency, billingCycle', async () => {
    const result = await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY });
    expect(result.statusCode).toBe(HttpStatus.CREATED);
    expect(result.data.authorizationUrl).toBe('https://checkout.paystack.com/sub-test');
    expect(result.data.currency).toBe('NGN');
    expect(result.data.billingCycle).toBe(BillingCycle.MONTHLY);
    expect(typeof result.data.amount).toBe('number');
  });

  it('does NOT include subscriptionCode in the response (access_code is not the real SUB_xxx)', async () => {
    const result = await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY });
    expect(result.data).not.toHaveProperty('subscriptionCode');
  });

  it('returns PRO_MONTHLY_KOBO amount for monthly billingCycle', async () => {
    const result = await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY });
    expect(result.data.amount).toBe(300000);
  });

  it('returns PRO_ANNUAL_KOBO amount for annual billingCycle', async () => {
    const result = await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.ANNUAL });
    expect(result.data.amount).toBe(3200000);
  });

  it('hardcodes plan: PRO — never passes client-supplied plan to service (SEC-01)', async () => {
    await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY });
    expect(SERVICE_MOCK.initiateSubscription).toHaveBeenCalledWith(
      USER_ID,
      EMAIL,
      expect.objectContaining({ plan: PaymentPlan.PRO }),
    );
  });

  it('passes billingCycle from body to service unchanged', async () => {
    await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.ANNUAL });
    expect(SERVICE_MOCK.initiateSubscription).toHaveBeenCalledWith(
      USER_ID,
      EMAIL,
      expect.objectContaining({ billingCycle: BillingCycle.ANNUAL }),
    );
  });

  it('maps non-HttpException provider errors to BadGatewayException (502)', async () => {
    SERVICE_MOCK.initiateSubscription.mockRejectedValueOnce(new Error('Network timeout'));
    await expect(
      controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('does not wrap ConflictException (409 idempotency passes through)', async () => {
    SERVICE_MOCK.initiateSubscription.mockRejectedValueOnce(new ConflictException('already in progress'));
    await expect(
      controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not wrap PaymentFailedException (402 passes through as HttpException)', async () => {
    const err = new PaymentFailedException('declined');
    SERVICE_MOCK.initiateSubscription.mockRejectedValueOnce(err);
    const thrown = await controller.initiateSubscription(USER_ID, EMAIL, { billingCycle: BillingCycle.MONTHLY }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown).not.toBeInstanceOf(BadGatewayException);
  });
});

describe('PaymentRateLimitGuard', () => {
  let guard: PaymentRateLimitGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRateLimitGuard,
        { provide: SubscriptionModelAction, useValue: SUBSCRIPTION_ACTION_MOCK },
        { provide: RedisService, useValue: REDIS_SERVICE_MOCK },
      ],
    }).compile();

    guard = module.get<PaymentRateLimitGuard>(PaymentRateLimitGuard);
  });

  it('passes through when user has no active subscription and is under the limit', async () => {
    SUBSCRIPTION_ACTION_MOCK.list.mockResolvedValueOnce({ payload: [], paginationMeta: {} });
    REDIS_SERVICE_MOCK.rateLimit.mockResolvedValueOnce({ count: 1, exceeded: false });
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('throws 409 before incrementing the rate limit when user is already Pro', async () => {
    SUBSCRIPTION_ACTION_MOCK.list.mockResolvedValueOnce({
      payload: [{ id: 'sub-1', status: SubscriptionStatus.ACTIVE }],
      paginationMeta: {},
    });
    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(ConflictException);
    expect(REDIS_SERVICE_MOCK.rateLimit).not.toHaveBeenCalled();
  });

  it('throws 429 when rateLimit reports exceeded', async () => {
    SUBSCRIPTION_ACTION_MOCK.list.mockResolvedValueOnce({ payload: [], paginationMeta: {} });
    REDIS_SERVICE_MOCK.rateLimit.mockResolvedValueOnce({ count: 6, exceeded: true });
    const thrown = await guard.canActivate(buildContext()).catch((e: unknown) => e);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('uses userId as the rate limit key, not IP (SEC-04)', async () => {
    SUBSCRIPTION_ACTION_MOCK.list.mockResolvedValueOnce({ payload: [], paginationMeta: {} });
    REDIS_SERVICE_MOCK.rateLimit.mockResolvedValueOnce({ count: 1, exceeded: false });
    await guard.canActivate(buildContext());
    expect(REDIS_SERVICE_MOCK.rateLimit).toHaveBeenCalledWith(
      `ratelimit:payment-initiate:${USER_ID}`,
      5,
      3600,
    );
  });

  it('does not increment the rate limit counter for already-Pro users (SEC-05)', async () => {
    SUBSCRIPTION_ACTION_MOCK.list.mockResolvedValueOnce({
      payload: [{ id: 'sub-1', status: SubscriptionStatus.ACTIVE }],
      paginationMeta: {},
    });
    await guard.canActivate(buildContext()).catch(() => undefined);
    expect(REDIS_SERVICE_MOCK.rateLimit).not.toHaveBeenCalled();
  });
});

describe('PaymentsController — GET /payments/subscription', () => {
  let controller: PaymentsController;

  const SUBSCRIPTION_SERVICE_MOCK = {
    ...SERVICE_MOCK,
    getUserSubscription: jest.fn(),
    cancelUserSubscription: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: SUBSCRIPTION_SERVICE_MOCK }],
    })
      .overrideGuard(PaymentRateLimitGuard)
      .useValue(RATE_LIMIT_GUARD_MOCK)
      .overrideGuard(SubscriptionRateLimitGuard)
      .useValue(SUBSCRIPTION_RATE_LIMIT_GUARD_MOCK)
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  const SUBSCRIPTION_DATA = {
    subscriptionId: 'sub-1',
    plan: 'pro',
    billingCycle: 'monthly',
    status: 'active',
    currentPeriodStart: '2026-06-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    cancelledAt: null,
    downgradeAt: null,
  };

  it('returns 200 with data from the service', async () => {
    SUBSCRIPTION_SERVICE_MOCK.getUserSubscription.mockResolvedValueOnce(SUBSCRIPTION_DATA);

    const result = await controller.getSubscription(USER_ID);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.data).toEqual(SUBSCRIPTION_DATA);
    expect(SUBSCRIPTION_SERVICE_MOCK.getUserSubscription).toHaveBeenCalledWith(USER_ID);
  });

  it('propagates NotFoundException (404) unchanged when no active subscription', async () => {
    SUBSCRIPTION_SERVICE_MOCK.getUserSubscription.mockRejectedValueOnce(new NotFoundException('No active subscription found'));

    await expect(controller.getSubscription(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PaymentsController — DELETE /payments/subscription', () => {
  let controller: PaymentsController;

  const SUBSCRIPTION_SERVICE_MOCK = {
    ...SERVICE_MOCK,
    getUserSubscription: jest.fn(),
    cancelUserSubscription: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: SUBSCRIPTION_SERVICE_MOCK }],
    })
      .overrideGuard(PaymentRateLimitGuard)
      .useValue(RATE_LIMIT_GUARD_MOCK)
      .overrideGuard(SubscriptionRateLimitGuard)
      .useValue(SUBSCRIPTION_RATE_LIMIT_GUARD_MOCK)
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  const CANCEL_DATA = {
    cancelledAt: '2026-06-06T12:00:00.000Z',
    accessUntil: '2026-07-01T00:00:00.000Z',
  };

  it('returns 200 with data from the service', async () => {
    SUBSCRIPTION_SERVICE_MOCK.cancelUserSubscription.mockResolvedValueOnce(CANCEL_DATA);

    const result = await controller.cancelUserSubscription(USER_ID);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.data).toEqual(CANCEL_DATA);
    expect(SUBSCRIPTION_SERVICE_MOCK.cancelUserSubscription).toHaveBeenCalledWith(USER_ID);
  });

  it('propagates NotFoundException (404) when no active subscription', async () => {
    SUBSCRIPTION_SERVICE_MOCK.cancelUserSubscription.mockRejectedValueOnce(new NotFoundException('No active subscription found'));

    await expect(controller.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates ConflictException (409) when subscription is already cancelled', async () => {
    SUBSCRIPTION_SERVICE_MOCK.cancelUserSubscription.mockRejectedValueOnce(new ConflictException('already cancelled'));

    await expect(controller.cancelUserSubscription(USER_ID)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SubscriptionRateLimitGuard', () => {
  let guard: SubscriptionRateLimitGuard;

  const SUB_ACTION_MOCK = {
    list: jest.fn().mockResolvedValue({ payload: [], paginationMeta: {} }),
  };
  const REDIS_MOCK = {
    rateLimit: jest.fn().mockResolvedValue({ count: 1, exceeded: false }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionRateLimitGuard,
        { provide: SubscriptionModelAction, useValue: SUB_ACTION_MOCK },
        { provide: RedisService, useValue: REDIS_MOCK },
      ],
    }).compile();

    guard = module.get<SubscriptionRateLimitGuard>(SubscriptionRateLimitGuard);
  });

  it('passes through when user has no active/pending subscription and is under the limit', async () => {
    SUB_ACTION_MOCK.list.mockResolvedValueOnce({ payload: [], paginationMeta: {} });
    REDIS_MOCK.rateLimit.mockResolvedValueOnce({ count: 1, exceeded: false });
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('throws 409 before incrementing counter when user has an ACTIVE subscription', async () => {
    SUB_ACTION_MOCK.list.mockResolvedValueOnce({
      payload: [{ id: 'sub-1', status: SubscriptionStatus.ACTIVE }],
      paginationMeta: {},
    });
    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(ConflictException);
    expect(REDIS_MOCK.rateLimit).not.toHaveBeenCalled();
  });

  it('throws 409 before incrementing counter when user has a PENDING subscription', async () => {
    SUB_ACTION_MOCK.list.mockResolvedValueOnce({
      payload: [{ id: 'sub-2', status: SubscriptionStatus.PENDING }],
      paginationMeta: {},
    });
    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(ConflictException);
    expect(REDIS_MOCK.rateLimit).not.toHaveBeenCalled();
  });

  it('throws 429 when rateLimit reports exceeded', async () => {
    SUB_ACTION_MOCK.list.mockResolvedValueOnce({ payload: [], paginationMeta: {} });
    REDIS_MOCK.rateLimit.mockResolvedValueOnce({ count: 6, exceeded: true });
    const thrown = await guard.canActivate(buildContext()).catch((e: unknown) => e);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('uses userId as the rate limit key, not IP (SEC-04)', async () => {
    SUB_ACTION_MOCK.list.mockResolvedValueOnce({ payload: [], paginationMeta: {} });
    REDIS_MOCK.rateLimit.mockResolvedValueOnce({ count: 1, exceeded: false });
    await guard.canActivate(buildContext());
    expect(REDIS_MOCK.rateLimit).toHaveBeenCalledWith(
      `ratelimit:subscription-initiate:${USER_ID}`,
      5,
      3600,
    );
  });

  it('does not increment the rate limit counter when user already has a subscription', async () => {
    SUB_ACTION_MOCK.list.mockResolvedValueOnce({
      payload: [{ id: 'sub-1', status: SubscriptionStatus.PENDING }],
      paginationMeta: {},
    });
    await guard.canActivate(buildContext()).catch(() => undefined);
    expect(REDIS_MOCK.rateLimit).not.toHaveBeenCalled();
  });
});
