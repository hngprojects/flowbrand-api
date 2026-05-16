import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../redis/redis.service';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { AuthMetadataModelAction } from '../actions/auth-metadata.action';
import { OtpTokenModelAction } from '../actions/otp-token.action';
import { EmailService } from '../../../email/email.service';
import * as SYS_MSG from '../../../constants/system.messages';

const mockUsersService = {
  findByEmail: jest.fn(),
  markVerified: jest.fn(),
  findById: jest.fn(),
  remove: jest.fn(),
};
const mockRedisService = {
  incr: jest.fn(),
  expire: jest.fn(),
  setStrict: jest.fn(),
  del: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};
const mockOtpTokenModelAction = {
  replaceToken: jest.fn(),
  delete: jest.fn(),
  findByUserAndType: jest.fn(),
};
const mockEmailService = { sendOtpVerification: jest.fn() };
const mockJwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
const mockUserSessionModelAction = {
  findById: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  createSession: jest.fn(),
};
const mockAuthMetadataModelAction = {
  findByUserId: jest.fn(),
  updateByUserId: jest.fn(),
  createForUser: jest.fn(),
};

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER_EMAIL = 'ada@example.com';

const UNVERIFIED_USER = {
  id: USER_ID,
  email: USER_EMAIL,
  full_name: 'Ada Lovelace',
  is_verified: false,
  is_active: true,
};

describe('AuthService.resendOtp (BE-004)', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: AuthMetadataModelAction, useValue: mockAuthMetadataModelAction },
        { provide: OtpTokenModelAction, useValue: mockOtpTokenModelAction },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-value');
  });

  describe('unknown email', () => {
    it('returns OTP_SENT_SUCCESSFULLY silently without sending anything', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.resendOtp(USER_EMAIL);

      expect(result.message).toBe(SYS_MSG.OTP_SENT_SUCCESSFULLY);
      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
      expect(mockRedisService.incr).not.toHaveBeenCalled();
    });
  });

  describe('already verified', () => {
    it('returns ACCOUNT_ALREADY_VERIFIED without sending anything', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...UNVERIFIED_USER, is_verified: true });

      const result = await service.resendOtp(USER_EMAIL);

      expect(result.message).toBe(SYS_MSG.ACCOUNT_ALREADY_VERIFIED);
      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
    });
  });

  describe('hourly rate limit', () => {
    it('throws 429 with retryAfter 3600 when hourly counter exceeds 10', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(11);

      await expect(service.resendOtp(USER_EMAIL)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        response: expect.objectContaining({
          message: SYS_MSG.OTP_RESEND_HOURLY_LIMIT,
          retryAfter: 3600,
        }),
      });

      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
    });

    it('sets a 3600-second TTL when hourly counter reaches 1 (first request)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(undefined);
      mockRedisService.get.mockResolvedValue(null);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);
      mockRedisService.set.mockResolvedValue(undefined);

      await service.resendOtp(USER_EMAIL);

      expect(mockRedisService.expire).toHaveBeenCalledWith(`otp:resend:${USER_ID}`, 3600);
    });

    it('does not reset TTL when hourly counter is greater than 1', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(3);
      mockRedisService.get.mockResolvedValue(null);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);
      mockRedisService.set.mockResolvedValue(undefined);

      await service.resendOtp(USER_EMAIL);

      expect(mockRedisService.expire).not.toHaveBeenCalled();
    });
  });

  describe('30-second cooldown', () => {
    it('throws 429 with the correct retryAfter when cooldown key exists', async () => {
      const expiresAt = Date.now() + 18_000;
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(2);
      mockRedisService.get.mockResolvedValue(String(expiresAt));

      await expect(service.resendOtp(USER_EMAIL)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        response: expect.objectContaining({
          message: SYS_MSG.OTP_RESEND_RATE_LIMITED,
          retryAfter: expect.any(Number),
        }),
      });

      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
    });

    it('retryAfter is a positive integer when cooldown is active', async () => {
      const expiresAt = Date.now() + 18_000;
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(2);
      mockRedisService.get.mockResolvedValue(String(expiresAt));

      let retryAfter: number | undefined;
      try {
        await service.resendOtp(USER_EMAIL);
      } catch (err: unknown) {
        const e = err as { response?: { retryAfter?: unknown } };
        retryAfter = e.response?.retryAfter as number;
      }

      expect(retryAfter).toBeGreaterThan(0);
      expect(Number.isInteger(retryAfter)).toBe(true);
    });
  });

  describe('happy path', () => {
    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(undefined);
      mockRedisService.get.mockResolvedValue(null);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);
      mockRedisService.set.mockResolvedValue(undefined);
    });

    it('returns OTP_RESENT_SUCCESSFULLY', async () => {
      const result = await service.resendOtp(USER_EMAIL);

      expect(result.message).toBe(SYS_MSG.OTP_RESENT_SUCCESSFULLY);
    });

    it('sends a verification email to the user', async () => {
      await service.resendOtp(USER_EMAIL);

      expect(mockEmailService.sendOtpVerification).toHaveBeenCalledWith(
        USER_EMAIL,
        expect.objectContaining({ fullName: UNVERIFIED_USER.full_name, expiryMins: 5 }),
        USER_ID,
      );
    });

    it('sets the 30-second cooldown key after sending', async () => {
      const before = Date.now();
      await service.resendOtp(USER_EMAIL);
      const after = Date.now();

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `otp:cooldown:${USER_ID}`,
        expect.any(String),
        30,
      );

      const setCall = mockRedisService.set.mock.calls[0];
      const storedTimestamp = parseInt(setCall[1] as string);
      expect(storedTimestamp).toBeGreaterThanOrEqual(before + 30_000);
      expect(storedTimestamp).toBeLessThanOrEqual(after + 30_000);
    });

    it('calls replaceToken with the correct payload (atomic delete+create)', async () => {
      await service.resendOtp(USER_EMAIL);

      expect(mockOtpTokenModelAction.replaceToken).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_ID,
          type: 'email_verification',
          token_hash: expect.any(String),
          expires_at: expect.any(Date),
        }),
      );
    });
  });
});
