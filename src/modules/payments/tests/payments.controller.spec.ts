import { BadGatewayException, ConflictException, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';
import { PaymentRateLimitGuard } from '../guards/payment-rate-limit.guard';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { RedisService } from '../../redis/redis.service';
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
};

const RATE_LIMIT_GUARD_MOCK = { canActivate: jest.fn().mockResolvedValue(true) };

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
