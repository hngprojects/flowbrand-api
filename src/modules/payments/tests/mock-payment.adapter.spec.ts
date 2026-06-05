import { MockPaymentAdapter } from '../adapters/mock-payment.adapter';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { env } from '../../../config/env';

jest.mock('../../../config/env', () => ({
  env: { TEST_PAYMENT_OUTCOME: 'success' },
}));

describe('MockPaymentAdapter', () => {
  let adapter: MockPaymentAdapter;
  const mockEnv = env as { TEST_PAYMENT_OUTCOME: string };

  beforeEach(() => {
    adapter = new MockPaymentAdapter();
    mockEnv.TEST_PAYMENT_OUTCOME = 'success';
  });

  const paymentDto = { plan: PaymentPlan.PRO, type: PaymentType.ONE_TIME };
  const subDto = { plan: PaymentPlan.PRO, billingCycle: BillingCycle.MONTHLY };

  describe('initiatePayment', () => {
    it('returns a reference and authorizationUrl on success (AC-02)', async () => {
      const result = await adapter.initiatePayment(paymentDto, 'u1', 'u@test.com');
      expect(result.reference).toMatch(/^mock_ref_/);
      expect(result.authorizationUrl).toBeTruthy();
      expect(result.provider).toBe('mock');
    });

    it('throws PaymentFailedException on failure outcome (AC-03)', async () => {
      mockEnv.TEST_PAYMENT_OUTCOME = 'failure';
      await expect(adapter.initiatePayment(paymentDto, 'u1', 'u@test.com')).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  describe('verifyPayment', () => {
    it('returns success status when outcome is success', async () => {
      const result = await adapter.verifyPayment('mock_ref_123');
      expect(result.status).toBe('success'); // PaymentStatus.SUCCESS = 'success'
      expect(result.reference).toBe('mock_ref_123');
    });

    it('returns pending status when outcome is pending', async () => {
      mockEnv.TEST_PAYMENT_OUTCOME = 'pending';
      const result = await adapter.verifyPayment('mock_ref_123');
      expect(result.status).toBe('pending'); // PaymentStatus.PENDING = 'pending'
    });
  });

  describe('initiateSubscription', () => {
    it('returns a subscriptionCode and authorizationUrl on success', async () => {
      const result = await adapter.initiateSubscription(subDto, 'u1', 'u@test.com');
      expect(result.subscriptionCode).toMatch(/^mock_sub_/);
      expect(result.authorizationUrl).toBeTruthy();
      expect(result.provider).toBe('mock');
    });

    it('throws PaymentFailedException on failure outcome', async () => {
      mockEnv.TEST_PAYMENT_OUTCOME = 'failure';
      await expect(adapter.initiateSubscription(subDto, 'u1', 'u@test.com')).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  describe('cancelSubscription', () => {
    it('resolves without error', async () => {
      await expect(adapter.cancelSubscription('mock_code')).resolves.toBeUndefined();
    });
  });
});
