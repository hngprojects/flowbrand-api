import { BadRequestException, ConflictException } from '@nestjs/common';
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
const OTP_CODE = '123456';
const FUTURE_DATE = new Date(Date.now() + 5 * 60 * 1000);

const UNVERIFIED_USER = {
  id: USER_ID,
  email: USER_EMAIL,
  full_name: 'Ada Lovelace',
  is_verified: false,
  is_active: true,
};

const VERIFIED_USER = { ...UNVERIFIED_USER, is_verified: true };

const VALID_TOKEN = {
  id: 'tok-1',
  user_id: USER_ID,
  type: 'email_verification',
  token_hash: 'hashed-otp',
  expires_at: FUTURE_DATE,
};

describe('AuthService.verifyOtp (BE-004)', () => {
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
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('unknown email', () => {
    it('throws 400 OTP_INVALID without leaking that the email does not exist', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.verifyOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(
        new BadRequestException(SYS_MSG.OTP_INVALID),
      );

      expect(mockUserSessionModelAction.createSession).not.toHaveBeenCalled();
    });
  });

  describe('already verified', () => {
    it('throws 409 ACCOUNT_ALREADY_VERIFIED', async () => {
      mockUsersService.findByEmail.mockResolvedValue(VERIFIED_USER);

      await expect(service.verifyOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(
        new ConflictException(SYS_MSG.ACCOUNT_ALREADY_VERIFIED),
      );
    });
  });

  describe('no token in DB', () => {
    it('throws 400 OTP_INVALID when findByUserAndType returns null', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(null);

      await expect(service.verifyOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(
        new BadRequestException(SYS_MSG.OTP_INVALID),
      );
    });
  });

  describe('expired token', () => {
    it('deletes the token and throws 400 OTP_EXPIRED', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue({
        ...VALID_TOKEN,
        expires_at: new Date(Date.now() - 1000),
      });
      mockOtpTokenModelAction.delete.mockResolvedValue(undefined);

      await expect(service.verifyOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(
        new BadRequestException(SYS_MSG.OTP_EXPIRED),
      );

      expect(mockOtpTokenModelAction.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          identifierOptions: expect.objectContaining({
            user_id: USER_ID,
            type: 'email_verification',
          }),
        }),
      );
      expect(mockUsersService.markVerified).not.toHaveBeenCalled();
    });
  });

  describe('wrong code', () => {
    it('throws 400 OTP_INVALID when bcrypt.compare returns false', async () => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(VALID_TOKEN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.verifyOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(
        new BadRequestException(SYS_MSG.OTP_INVALID),
      );

      expect(mockUsersService.markVerified).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(UNVERIFIED_USER);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(VALID_TOKEN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockOtpTokenModelAction.delete.mockResolvedValue(undefined);
      mockUsersService.markVerified.mockResolvedValue(VERIFIED_USER);
      mockUserSessionModelAction.createSession.mockResolvedValue({ id: 'session-1' });
      mockJwtService.signAsync.mockResolvedValue('fake-jwt');
      mockUserSessionModelAction.updateById.mockResolvedValue({});
      mockRedisService.setStrict.mockResolvedValue(undefined);
    });

    it('deletes the token after successful verification', async () => {
      await service.verifyOtp(USER_EMAIL, OTP_CODE);

      expect(mockOtpTokenModelAction.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          identifierOptions: expect.objectContaining({
            user_id: USER_ID,
            type: 'email_verification',
          }),
        }),
      );
    });

    it('calls markVerified with the correct user id', async () => {
      await service.verifyOtp(USER_EMAIL, OTP_CODE);

      expect(mockUsersService.markVerified).toHaveBeenCalledWith(USER_ID);
    });

    it('returns an auth response with an access token', async () => {
      const result = await service.verifyOtp(USER_EMAIL, OTP_CODE);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toMatchObject({ email: USER_EMAIL });
    });

    it('does not include password_hash in the returned user', async () => {
      mockUsersService.markVerified.mockResolvedValue({
        ...VERIFIED_USER,
        password_hash: 'secret',
      });

      const result = await service.verifyOtp(USER_EMAIL, OTP_CODE);

      expect(result.user).not.toHaveProperty('password_hash');
    });
  });
});
