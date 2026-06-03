import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { EmailService } from '../email.service';
import { JOBS, QUEUES } from '../../common/constants/queue.constants';

const mockQueue = { add: jest.fn() };

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: getQueueToken(QUEUES.EMAIL), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  const otpPayload = { fullName: 'Ada', otpCode: '123456', expiryMins: 5 };

  describe('sendOtpVerification()', () => {
    it('adds a job with type otp-verification and returns jobId', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const jobId = await service.sendOtpVerification('ada@test.com', otpPayload, 'user-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOBS.SEND_EMAIL,
        expect.objectContaining({ type: 'otp-verification', to: 'ada@test.com' }),
        expect.any(Object),
      );
      expect(jobId).toBe('job-1');
    });

    it('resolves without throwing when Redis is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));

      await expect(
        service.sendOtpVerification('ada@test.com', otpPayload),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendOtpReset()', () => {
    it('adds a job with type otp-reset and returns jobId', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-2' });

      const jobId = await service.sendOtpReset('ada@test.com', otpPayload, 'user-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOBS.SEND_EMAIL,
        expect.objectContaining({ type: 'otp-reset', to: 'ada@test.com' }),
        expect.any(Object),
      );
      expect(jobId).toBe('job-2');
    });

    it('resolves without throwing when Redis is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));

      await expect(
        service.sendOtpReset('ada@test.com', otpPayload),
      ).resolves.toBeUndefined();
    });
  });

  it('calls queue.add for both send methods (all dispatch paths covered)', async () => {
    mockQueue.add.mockResolvedValue({ id: 'x' });

    await service.sendOtpVerification('a@test.com', otpPayload);
    await service.sendOtpReset('a@test.com', otpPayload);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  describe('sendPaymentSuccessful()', () => {
    const payload = {
      name: 'Ada',
      amount: '₦10,000.00',
      cardLast4: '4242',
      cardBrand: 'Visa',
      reference: 'ref-uuid-123',
      paidAt: 'May 4, 2026',
    };

    it('AC-01: enqueues a payment-successful job and returns the job id', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-10' });

      const jobId = await service.sendPaymentSuccessful('ada@test.com', payload, 'user-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOBS.SEND_EMAIL,
        expect.objectContaining({ type: 'payment-successful', to: 'ada@test.com' }),
        expect.any(Object),
      );
      expect(jobId).toBe('job-10');
    });

    it('AC-02: resolves without throwing when Redis is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.sendPaymentSuccessful('ada@test.com', payload)).resolves.toBeUndefined();
    });
  });

  describe('sendPaymentFailed()', () => {
    const payload = { name: 'Ada', failureReason: 'Insufficient funds' };

    it('AC-03: enqueues a payment-failed job and returns the job id', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-11' });

      const jobId = await service.sendPaymentFailed('ada@test.com', payload, 'user-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOBS.SEND_EMAIL,
        expect.objectContaining({ type: 'payment-failed', to: 'ada@test.com' }),
        expect.any(Object),
      );
      expect(jobId).toBe('job-11');
    });

    it('AC-04: resolves without throwing when Redis is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.sendPaymentFailed('ada@test.com', payload)).resolves.toBeUndefined();
    });
  });

  describe('sendSubscriptionCancelled()', () => {
    const payload = { name: 'Ada', accessUntil: 'June 30, 2026' };

    it('AC-05: enqueues a subscription-cancelled job and returns the job id', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-12' });

      const jobId = await service.sendSubscriptionCancelled('ada@test.com', payload, 'user-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOBS.SEND_EMAIL,
        expect.objectContaining({ type: 'subscription-cancelled', to: 'ada@test.com' }),
        expect.any(Object),
      );
      expect(jobId).toBe('job-12');
    });

    it('AC-06: resolves without throwing when Redis is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.sendSubscriptionCancelled('ada@test.com', payload)).resolves.toBeUndefined();
    });
  });

  describe('sendNotificationAlert()', () => {
    const payload = { name: 'Ada', unreadCount: 5 };

    it('AC-07: enqueues a notification-alert job and returns the job id', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-13' });

      const jobId = await service.sendNotificationAlert('ada@test.com', payload, 'user-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOBS.SEND_EMAIL,
        expect.objectContaining({ type: 'notification-alert', to: 'ada@test.com' }),
        expect.any(Object),
      );
      expect(jobId).toBe('job-13');
    });

    it('AC-08: resolves without throwing when Redis is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.sendNotificationAlert('ada@test.com', payload)).resolves.toBeUndefined();
    });
  });
});
