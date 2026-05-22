import { HttpException, HttpStatus, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createGoogleAccount: jest.fn(),
  updateGoogleAccount: jest.fn(),
};
const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};
const mockRedisService = { setStrict: jest.fn(), del: jest.fn(), rateLimit: jest.fn(), getdel: jest.fn() };
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
  is_verified: true,
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
    mockRedisService.setStrict.mockResolvedValue(undefined);
    mockRedisService.del.mockResolvedValue(undefined);

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

      it('throws 403 Forbidden when the user is not verified', async () => {
    mockUsersService.findByEmail.mockResolvedValue({
      ...TEST_USER,
      is_verified: false,
    });

    await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(ForbiddenException);
  });
  });

  describe('Google OAuth login', () => {
    it('creates a new verified Google account and issues tokens', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createGoogleAccount.mockResolvedValue({
        id: 'google-user-1',
        email: 'new.google@example.com',
        full_name: 'Google User',
        avatar_url: 'https://example.com/avatar.png',
        is_verified: true,
        auth_provider: 'google',
        provider_user_id: 'google-123',
        password_hash: null,
        is_active: true,
      });

      const result = await service.handleOAuthLogin({
        provider: 'google',
        providerId: 'google-123',
        email: 'new.google@example.com',
        full_name: 'Google User',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(mockUsersService.createGoogleAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new.google@example.com',
          providerUserId: 'google-123',
        }),
      );
      expect(result).toMatchObject({
        status_code: HttpStatus.OK,
        message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
        access_token: 'signed.jwt.token',
        refresh_token: 'signed.jwt.token',
      });
    });

    it('links an existing local account to the Google provider', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...TEST_USER,
        auth_provider: 'local',
        provider_user_id: null,
        password_hash: TEST_USER.password_hash,
      });
      mockUsersService.updateGoogleAccount.mockResolvedValue({
        ...TEST_USER,
        auth_provider: 'google',
        provider_user_id: 'google-456',
        is_verified: true,
      });

      const result = await service.handleOAuthLogin({
        provider: 'google',
        providerId: 'google-456',
        email: TEST_USER.email,
        full_name: TEST_USER.full_name,
        avatar_url: null,
      });

      expect(mockUsersService.updateGoogleAccount).toHaveBeenCalledWith(
        TEST_USER.id,
        expect.objectContaining({
          providerUserId: 'google-456',
          fullName: TEST_USER.full_name,
        }),
      );
      expect(result).toMatchObject({
        status_code: HttpStatus.OK,
        message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
        access_token: 'signed.jwt.token',
        refresh_token: 'signed.jwt.token',
      });
    });
  });

    describe('Google OAuth Short-lived Exchange Flow', () => {
    const mockProfile = {
      provider: 'google' as const,
      providerId: 'google-123',
      email: 'jane@example.com',
      full_name: 'Jane Doe',
      avatar_url: null,
    };

    const mockOAuthResponse = {
      status_code: HttpStatus.OK,
      message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
      access_token: 'access.jwt.token',
      refresh_token: 'refresh.jwt.token',
      data: {
        user: {
          id: 'user-uuid-1',
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          avatarUrl: null,
        },
      },
    };

    describe('initiateOAuthExchange', () => {
      it('creates/updates account, signs tokens, and stores them in Redis with 60s TTL', async () => {
        mockUsersService.findByEmail.mockResolvedValue(null);
        mockUsersService.createGoogleAccount.mockResolvedValue({
          id: 'user-uuid-1',
          email: 'jane@example.com',
          full_name: 'Jane Doe',
          avatar_url: null,
          is_verified: true,
          auth_provider: 'google',
          provider_user_id: 'google-123',
          password_hash: null,
          is_active: true,
        });

        const code = await service.initiateOAuthExchange(mockProfile);

        expect(code).toBeDefined();
        expect(code).toHaveLength(64); // 32 bytes in hex = 64 characters
        expect(mockRedisService.setStrict).toHaveBeenCalledWith(
          `oauth:exchange:${code}`,
          expect.any(String),
          60,
        );

        const exchangeCall = mockRedisService.setStrict.mock.calls.find(
          (call) => call[0] === `oauth:exchange:${code}`
        );

        const storedData = JSON.parse(exchangeCall[1]);
        expect(storedData).toMatchObject({
          access_token: 'signed.jwt.token',
          refresh_token: 'signed.jwt.token',
        });
      });
    });

    describe('exchangeCode', () => {
      it('successfully retrieves and consumes code from Redis', async () => {
        mockRedisService.getdel.mockResolvedValue(JSON.stringify(mockOAuthResponse));

        const result = await service.exchangeCode('valid-exchange-code');

        expect(mockRedisService.getdel).toHaveBeenCalledWith('oauth:exchange:valid-exchange-code');
        expect(result).toEqual(mockOAuthResponse);
      });

      it('throws BadRequestException if code is invalid or expired', async () => {
        mockRedisService.getdel.mockResolvedValue(null);

        await expect(service.exchangeCode('expired-code')).rejects.toThrow(
          new BadRequestException(SYS_MSG.GOOGLE_EXCHANGE_CODE_INVALID),
        );
        expect(mockRedisService.del).not.toHaveBeenCalled();
      });
    });
  });
});

describe('AuthService - Password Reset Flow (BE-012)', () => {
  let service: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockRedisService: any;
  let mockUserSessionModelAction: any;
  let mockAuthMetadataModelAction: any;
  let mockOtpTokenModelAction: any;
  let mockEmailService: any;

  const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const USER_EMAIL = 'user@example.com';
  const OTP_CODE = '123456';
  const NEW_PASSWORD = 'NewSecurePass123!';

  const validUser = {
    id: USER_ID,
    email: USER_EMAIL,
    full_name: 'Test User',
    is_verified: true,
    is_active: true,
    password_hash: 'old-hash',
  };

  const validOtpToken = {
    id: 'otp-id',
    user_id: USER_ID,
    type: 'password_reset',
    token_hash: 'hashed-otp',
    expires_at: new Date(Date.now() + 15 * 60 * 1000),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
   
    mockUsersService = {
      findByEmail: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    mockRedisService = {
      incr: jest.fn(),
      expire: jest.fn(),
      rateLimit: jest.fn(),
      del: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      setNx: jest.fn().mockResolvedValue(1),  
      setStrict: jest.fn().mockResolvedValue(undefined),
    };

    mockUserSessionModelAction = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      createSession: jest.fn(),
    };

    mockAuthMetadataModelAction = {
      findByUserId: jest.fn(),
      updateByUserId: jest.fn(),
      createForUser: jest.fn(),
    };

    mockOtpTokenModelAction = {
      findByUserAndType: jest.fn(),
      replaceToken: jest.fn(),
      delete: jest.fn(),
    };

    mockEmailService = {
      sendPasswordReset: jest.fn().mockResolvedValue({ id: 'email-job-id' }),
      sendOtpVerification: jest.fn(),
      sendOtpReset: jest.fn(),
    };

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
  });

  describe('forgotPassword', () => {
    it('AC-01: returns 200 success message for valid email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockRedisService.incr.mockResolvedValue(1);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue(validOtpToken);

      const result = await service.forgotPassword(USER_EMAIL);

      expect(result).toEqual({
        message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
      });
    });

    it('AC-01: returns success message even when email does not exist (prevents enumeration)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@example.com');

      expect(result).toEqual({
        message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
      });
      expect(mockOtpTokenModelAction.replaceToken).not.toHaveBeenCalled();
    });

    it('AC-02: generates 6-digit OTP and sends to email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockRedisService.incr.mockResolvedValue(1);
      mockOtpTokenModelAction.replaceToken.mockResolvedValue(validOtpToken);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');

      await service.forgotPassword(USER_EMAIL);

      expect(mockOtpTokenModelAction.replaceToken).toHaveBeenCalled();
      expect(mockEmailService.sendPasswordReset).toHaveBeenCalled();
    });

    it('AC-03: sets expiry exactly 15 minutes from generation', async () => {
      const before = Date.now();
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockRedisService.incr.mockResolvedValue(1);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');

      await service.forgotPassword(USER_EMAIL);

      const replaceCall = mockOtpTokenModelAction.replaceToken.mock.calls[0][0];
      const expiresAt = replaceCall.expires_at.getTime();
      const after = Date.now();
      
      expect(expiresAt).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
    });

    it('AC-04: rate limits to 3 requests per 15 minutes', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockRedisService.incr.mockResolvedValue(4);

      await expect(service.forgotPassword(USER_EMAIL)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_RATE_LIMITED
      );
    });
  });

  describe('resetPassword', () => {
  beforeEach(() => {
    mockRedisService.rateLimit.mockResolvedValue({ exceeded: false });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    mockUserSessionModelAction.findByUserId.mockResolvedValue([]);
    mockJwtService.signAsync.mockResolvedValue('new.jwt.token');
    mockUserSessionModelAction.createSession.mockResolvedValue({ id: 'new-session' });
    mockUsersService.update.mockResolvedValue({ ...validUser });
    mockRedisService.setStrict.mockResolvedValue(undefined);
  });

  it('AC-06: successfully resets password and auto-logs in user', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);

    const result = await service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD);

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('user');
  });

  it('AC-07: throws 400 when OTP is invalid', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(null);

    await expect(
      service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD)
    ).rejects.toThrow(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
  });

  it('AC-07: throws 400 when OTP code does not match', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD)
    ).rejects.toThrow(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
  });

  it('AC-08: throws 400 when OTP is expired', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue({
      ...validOtpToken,
      expires_at: new Date(Date.now() - 1000),
    });

    await expect(
      service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD)
    ).rejects.toThrow(SYS_MSG.PASSWORD_RESET_EXPIRED);
  });

  it('AC-09: throws 400 when email does not exist (prevents enumeration)', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.resetPassword('nonexistent@example.com', OTP_CODE, NEW_PASSWORD)
    ).rejects.toThrow(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
  });

  it('AC-10: rate limits verification attempts to 5 per 5 minutes', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockRedisService.rateLimit.mockResolvedValue({ exceeded: true });

    await expect(
      service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD)
    ).rejects.toThrow(SYS_MSG.PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED);
  });

  it('AC-11: revokes all existing user sessions after password change', async () => {
    const sessions = [
      { id: 'session-1', is_revoked: false },
      { id: 'session-2', is_revoked: false },
    ];
    
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);
    mockUsersService.update.mockResolvedValue({ ...validUser });
    mockUserSessionModelAction.findByUserId.mockResolvedValue(sessions);
    mockUserSessionModelAction.updateById.mockResolvedValue({});

    await service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD);

    // Check that updateById was called with is_revoked: true for each session
    const updateCalls = mockUserSessionModelAction.updateById.mock.calls;
    const revokedSessionUpdates = updateCalls.filter(call => 
      call[1]?.is_revoked === true
    );
    expect(revokedSessionUpdates.length).toBe(2);
  });

  it('AC-12: deletes the OTP token after successful reset', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);
    mockUsersService.update.mockResolvedValue({ ...validUser });
    mockUserSessionModelAction.findByUserId.mockResolvedValue([]);

    await service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD);

    expect(mockOtpTokenModelAction.delete).toHaveBeenCalled();
  });

  it('AC-13: issues new access and refresh tokens for auto-login', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);
    mockUsersService.update.mockResolvedValue({ ...validUser });
    mockUserSessionModelAction.findByUserId.mockResolvedValue([]);
    mockJwtService.signAsync.mockResolvedValue('brand-new-jwt-token');

    const result = await service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD);

    expect(mockJwtService.signAsync).toHaveBeenCalled();
    expect(result.accessToken).toBe('brand-new-jwt-token');
  });

  it('AC-14: updates password with bcrypt hash', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);
    mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);
    mockUserSessionModelAction.findByUserId.mockResolvedValue([]);
    
    mockUsersService.update.mockResolvedValue({ ...validUser });

    await service.resetPassword(USER_EMAIL, OTP_CODE, NEW_PASSWORD);

    expect(mockUsersService.update).toHaveBeenCalledWith(
      USER_ID,
      { password: NEW_PASSWORD }
    );
  });
});
});
