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
      providers: [EmailService, { provide: getQueueToken(QUEUES.EMAIL), useValue: mockQueue }],
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

      await expect(service.sendOtpVerification('ada@test.com', otpPayload)).resolves.toBeUndefined();
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

      await expect(service.sendOtpReset('ada@test.com', otpPayload)).resolves.toBeUndefined();
    });
  });

  it('calls queue.add for both send methods (all dispatch paths covered)', async () => {
    mockQueue.add.mockResolvedValue({ id: 'x' });

    await service.sendOtpVerification('a@test.com', otpPayload);
    await service.sendOtpReset('a@test.com', otpPayload);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });
});
