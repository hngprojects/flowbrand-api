import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../redis/redis.service';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { AuthMetadataModelAction } from '../actions/auth-metadata.action';
import { OtpTokenModelAction } from '../actions/otp-token.action';
import { EmailService } from '../../../email/email.service';
import { LogService } from '../../../common/services/log.service';
import * as SYS_MSG from '../../../constants/system.messages';

const mockUsersService = { findByEmail: jest.fn() };
const mockRedisService = {
  incr: jest.fn(),
  expire: jest.fn(),
  setStrict: jest.fn(),
  del: jest.fn(),
  rateLimit: jest.fn(),
};
const mockOtpTokenModelAction = {
  replaceToken: jest.fn(),
};
const mockEmailService = {
  sendOtpVerification: jest.fn(),
  sendOtpReset: jest.fn(),
};
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

describe('AuthService.sendOtp (BE-004)', () => {
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
        { provide: LogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('unknown user', () => {
    it('returns OTP_SENT_SUCCESSFULLY silently when email is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.sendOtp(USER_EMAIL);

      expect(result.message).toBe(SYS_MSG.OTP_SENT_SUCCESSFULLY);
      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
    });
  });

  describe('already verified', () => {
    it('returns OTP_SENT_SUCCESSFULLY silently when user is already verified (no enumeration)', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...UNVERIFIED_USER, is_verified: true });

      const result = await service.sendOtp(USER_EMAIL);

      expect(result.message).toBe(SYS_MSG.OTP_SENT_SUCCESSFULLY);
      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
      expect(mockOtpTokenModelAction.replaceToken).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('throws 429 when the Redis counter exceeds 5', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(6);

      await expect(service.sendOtp(USER_EMAIL)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        message: SYS_MSG.OTP_RATE_LIMITED,
      });

      expect(mockEmailService.sendOtpVerification).not.toHaveBeenCalled();
    });

    it('sets a 900-second TTL when the counter reaches 1 (first request in window)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(1);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);

      await service.sendOtp(USER_EMAIL);

      expect(mockRedisService.expire).toHaveBeenCalledWith(`otp:rate:${USER_ID}`, 900);
    });

    it('does not reset TTL when counter is greater than 1', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(3);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);

      await service.sendOtp(USER_EMAIL);

      expect(mockRedisService.expire).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(undefined);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);
    });

    it('returns OTP_SENT_SUCCESSFULLY', async () => {
      const result = await service.sendOtp(USER_EMAIL);
      expect(result.message).toBe(SYS_MSG.OTP_SENT_SUCCESSFULLY);
    });

    it('calls replaceToken with correct user_id, type, and 5-minute expiry', async () => {
      const before = Date.now();
      await service.sendOtp(USER_EMAIL);
      const after = Date.now();

      const call = mockOtpTokenModelAction.replaceToken.mock.calls[0][0];
      expect(call.user_id).toBe(USER_ID);
      expect(call.type).toBe('email_verification');
      expect(call.token_hash).toEqual(expect.any(String));
      expect(call).not.toHaveProperty('is_used');

      const fiveMinMs = 5 * 60 * 1000;
      expect(call.expires_at.getTime()).toBeGreaterThanOrEqual(before + fiveMinMs);
      expect(call.expires_at.getTime()).toBeLessThanOrEqual(after + fiveMinMs);
    });

    it("enqueues a verification email to the user's address with expiryMins: 5", async () => {
      await service.sendOtp(USER_EMAIL);

      expect(mockEmailService.sendOtpVerification).toHaveBeenCalledWith(
        UNVERIFIED_USER.email,
        expect.objectContaining({ expiryMins: 5, fullName: UNVERIFIED_USER.full_name }),
        USER_ID,
      );
    });

    it('increments the Redis rate counter with the correct key', async () => {
      await service.sendOtp(USER_EMAIL);
      expect(mockRedisService.incr).toHaveBeenCalledWith(`otp:rate:${USER_ID}`);
    });
  });

  describe('Redis failure', () => {
    it('proceeds without throwing when Redis incr returns null (Redis down)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockRedisService.incr.mockResolvedValue(null);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue({ id: 'tok-1' });
      mockEmailService.sendOtpVerification.mockResolvedValue(undefined);

      await expect(service.sendOtp(USER_EMAIL)).resolves.toMatchObject({
        message: SYS_MSG.OTP_SENT_SUCCESSFULLY,
      });
    });
  });
});
