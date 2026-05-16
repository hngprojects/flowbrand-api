import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { UserSessionModelAction } from '../users/actions/user-session.action';
import { AuthMetadataModelAction } from './actions/auth-metadata.action';
import { OtpTokenModelAction } from './actions/otp-token.action';
import { EmailService } from '../../email/email.service';
import * as SYS_MSG from '../../constants/system.messages';

jest.mock('bcrypt');

const mockUsersService = { findByEmail: jest.fn(), findById: jest.fn() };
const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};
const mockRedisService = { setStrict: jest.fn() };
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
const mockOtpTokenModelAction = {
  replaceToken: jest.fn(),
};
const mockEmailService = {
  sendOtpVerification: jest.fn(),
  sendOtpReset: jest.fn(),
};

const TEST_USER = {
  id: 'user-uuid-1',
  email: 'jane@example.com',
  full_name: 'Jane Doe',
  password_hash: '$2b$10$hash',
  is_active: true,
};

const LOGIN_DTO = { email: TEST_USER.email, password: 'CorrectPassword1!' };

function buildMetadata(overrides: Record<string, unknown> = {}) {
  return {
    id: 'meta-uuid-1',
    user_id: TEST_USER.id,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    password_changed_at: null,
    ...overrides,
  };
}

describe('AuthService login lockout (BE-005)', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJwtService.signAsync.mockResolvedValue('signed.jwt.token');
    mockUserSessionModelAction.createSession.mockResolvedValue({
      id: 'sess-1',
    });
    mockUserSessionModelAction.updateById.mockResolvedValue(null);
    mockAuthMetadataModelAction.updateByUserId.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: UserSessionModelAction,
          useValue: mockUserSessionModelAction,
        },
        {
          provide: AuthMetadataModelAction,
          useValue: mockAuthMetadataModelAction,
        },
        { provide: OtpTokenModelAction, useValue: mockOtpTokenModelAction },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('locked account', () => {
    it('throws 423 LOCKED when locked_until is in the future', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(
        buildMetadata({
          failed_attempts: 5,
          locked_until: new Date(Date.now() + 30 * 60 * 1000),
        }),
      );

      expect.assertions(3);
      try {
        await service.login(LOGIN_DTO);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.LOCKED);
        expect(httpErr.message).toBe(SYS_MSG.AUTH_ACCOUNT_LOCKED);
      }

      expect(bcrypt.compare).not.toHaveBeenCalled;
    });

    it('proceeds with credential check when locked_until is in the past', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(
        buildMetadata({
          failed_attempts: 5,
          locked_until: new Date(Date.now() - 1000),
        }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(LOGIN_DTO)).resolves.toMatchObject({
        accessToken: 'signed.jwt.token',
        refreshToken: 'signed.jwt.token',
      });
    });
  });

  describe('failed login tracking', () => {
    it('increments failed_attempts on wrong password and throws 401', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata({ failed_attempts: 2 }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockAuthMetadataModelAction.updateByUserId).toHaveBeenCalledWith(
        TEST_USER.id,
        expect.objectContaining({
          failed_attempts: 3,
          locked_until: null,
        }),
      );
    });

    it('locks the account on the 5th consecutive failed attempt and throws 423', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata({ failed_attempts: 4 }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      expect.assertions(4);
      try {
        await service.login(LOGIN_DTO);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.LOCKED);
        expect(httpErr.message).toBe(SYS_MSG.AUTH_TOO_MANY_FAILED_ATTEMPTS);
      }

      expect(mockAuthMetadataModelAction.updateByUserId).toHaveBeenCalledWith(
        TEST_USER.id,
        expect.objectContaining({
          failed_attempts: 5,
          locked_until: expect.any(Date),
        }),
      );
    });

    it('sets locked_until ~1 hour in the future on lock', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata({ failed_attempts: 4 }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const before = Date.now();
      await service.login(LOGIN_DTO).catch(() => undefined);
      const after = Date.now();

      const call = mockAuthMetadataModelAction.updateByUserId.mock.calls[0];
      const lockedUntil = (call[1] as { locked_until: Date }).locked_until;
      const oneHourMs = 60 * 60 * 1000;
      expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(before + oneHourMs);
      expect(lockedUntil.getTime()).toBeLessThanOrEqual(after + oneHourMs);
    });
  });

  describe('successful login', () => {
    it('resets failed_attempts, clears locked_until, and stamps last_login_at', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata({ failed_attempts: 3 }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login(LOGIN_DTO);

      expect(mockAuthMetadataModelAction.updateByUserId).toHaveBeenCalledWith(
        TEST_USER.id,
        expect.objectContaining({
          failed_attempts: 0,
          locked_until: null,
          last_login_at: expect.any(Date),
        }),
      );
    });

    it('issues access + refresh tokens', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(LOGIN_DTO);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(result.user.email).toBe(TEST_USER.email);
    });
  });

  describe('lazy auth metadata creation', () => {
    it('creates an AuthMetadata row the first time a user logs in', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(null);
      mockAuthMetadataModelAction.createForUser.mockResolvedValue(buildMetadata());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login(LOGIN_DTO);

      expect(mockAuthMetadataModelAction.createForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER.id,
          failed_attempts: 0,
          locked_until: null,
        }),
      );
    });
  });

  describe('invalid credentials', () => {
    it('throws 401 (not 423) when the user does not exist', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockAuthMetadataModelAction.findByUserId).not.toHaveBeenCalled();
    });

    it('throws 401 when the user has no password_hash (OAuth-only account)', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...TEST_USER,
        password_hash: null,
      });

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
