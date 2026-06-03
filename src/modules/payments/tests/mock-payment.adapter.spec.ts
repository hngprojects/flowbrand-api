import { MockPaymentAdapter } from '../adapters/mock-payment.adapter';
import { PaymentFailedException } from '../exceptions/payment-failed.exception';
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

  describe('initiatePayment', () => {
    it('returns a reference and authorizationUrl on success (AC-02)', async () => {
      const result = await adapter.initiatePayment();
      expect(result.reference).toMatch(/^mock_ref_/);
      expect(result.authorizationUrl).toBeTruthy();
      expect(result.provider).toBe('mock');
    });

    it('throws PaymentFailedException on failure outcome (AC-03)', async () => {
      mockEnv.TEST_PAYMENT_OUTCOME = 'failure';
      await expect(adapter.initiatePayment()).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  describe('verifyPayment', () => {
    it('returns success status when outcome is success', async () => {
      const result = await adapter.verifyPayment('mock_ref_123');
      expect(result.status).toBe('success');
      expect(result.reference).toBe('mock_ref_123');
    });

    it('returns pending status when outcome is pending', async () => {
      mockEnv.TEST_PAYMENT_OUTCOME = 'pending';
      const result = await adapter.verifyPayment('mock_ref_123');
      expect(result.status).toBe('pending');
    });
  });

  describe('initiateSubscription', () => {
    it('returns a subscriptionCode and authorizationUrl on success', async () => {
      const result = await adapter.initiateSubscription();
      expect(result.subscriptionCode).toMatch(/^mock_sub_/);
      expect(result.authorizationUrl).toBeTruthy();
      expect(result.provider).toBe('mock');
    });

    it('throws PaymentFailedException on failure outcome', async () => {
      mockEnv.TEST_PAYMENT_OUTCOME = 'failure';
      await expect(adapter.initiateSubscription()).rejects.toBeInstanceOf(PaymentFailedException);
    });
  });

  describe('cancelSubscription', () => {
    it('resolves without error', async () => {
      await expect(adapter.cancelSubscription('mock_code')).resolves.toBeUndefined();
    });
  });
});
