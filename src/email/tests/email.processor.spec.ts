import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailProcessor } from '../processors/email.processor';
import { TemplateService } from '../template.service';

const mockTemplateService = {
  render: jest.fn(),
};

const mockResend = {
  emails: {
    send: jest.fn(),
  },
};

const makeJob = (overrides = {}) => ({
  id: 'job-1',
  data: {
    to: 'ada@test.com',
    type: 'otp-verification' as const,
    payload: { fullName: 'Ada', otpCode: '123456', expiryMins: 5 },
    userId: 'user-1',
    requestId: 'req-1',
  },
  attemptsMade: 0,
  opts: { attempts: 3 },
  ...overrides,
});

describe('EmailProcessor.handleSendEmail', () => {
  let processor: EmailProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: TemplateService, useValue: mockTemplateService },
        { provide: 'RESEND_CLIENT', useValue: mockResend },
        { provide: ConfigService, 
          useValue: { 
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'email.from') return 'SEIL <noreply@seil.app>';
              throw new Error(`Unexpected config key: ${key}`);
            })
          }
        },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  describe('successful send', () => {
    it('renders the template and calls resend.emails.send with correct fields', async () => {
      mockTemplateService.render.mockReturnValue({
        html: '<p>code: 123456</p>',
        subject: 'Your SEIL verification code',
      });
      mockResend.emails.send.mockResolvedValue({ data: { id: 'resend-abc' }, error: null });

      await processor.handleSendEmail(makeJob() as never);

      expect(mockTemplateService.render).toHaveBeenCalledWith(
        'otp-verification',
        expect.objectContaining({ otpCode: '123456' }),
      );
      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ada@test.com',
          subject: 'Your SEIL verification code',
          html: '<p>code: 123456</p>',
        }),
      );
    });

    it('completes without throwing when resend returns a resendId', async () => {
      mockTemplateService.render.mockReturnValue({ html: '<p>ok</p>', subject: 'sub' });
      mockResend.emails.send.mockResolvedValue({ data: { id: 'resend-abc' }, error: null });

      await expect(processor.handleSendEmail(makeJob() as never)).resolves.toBeUndefined();
    });
  });

  describe('result.error set', () => {
    it('throws so BullMQ retries the job', async () => {
      mockTemplateService.render.mockReturnValue({ html: '<p>ok</p>', subject: 'sub' });
      mockResend.emails.send.mockResolvedValue({
        data: null,
        error: { message: 'rate limited' },
      });

      await expect(processor.handleSendEmail(makeJob() as never)).rejects.toThrow(
        'Resend error: rate limited',
      );
    });
  });

  describe('resend.emails.send throws', () => {
    it('propagates the error so BullMQ retries the job', async () => {
      mockTemplateService.render.mockReturnValue({ html: '<p>ok</p>', subject: 'sub' });
      mockResend.emails.send.mockRejectedValue(new Error('network timeout'));

      await expect(processor.handleSendEmail(makeJob() as never)).rejects.toThrow(
        'network timeout',
      );
    });
  });
});
