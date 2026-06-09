import {
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { UserSessionModelAction } from '../users/actions/user-session.action';
import { AuthMetadataModelAction } from './actions/auth-metadata.action';
import { OtpTokenModelAction } from './actions/otp-token.action';
import { EmailService } from '../../email/email.service';
import { LogService } from '../../common/services/log.service';
import { AdminLogActionType, AdminLogStatus } from '../admin/logs/enums/admin-log.enum';
import { APP_EVENTS } from '../../common/constants/app-events';
import { UserSignedUpEvent } from '../../common/events';
import * as SYS_MSG from '../../constants/system.messages';

jest.mock('bcrypt');

const mockUsersService = {
  findByEmail: jest.fn(),
  findByEmailWithDeleted: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
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
  incrementFailedAttempts: jest.fn(),
};
const mockOtpTokenModelAction = {
  replaceToken: jest.fn(),
};
const mockEmailService = {
  sendOtpVerification: jest.fn(),
  sendOtpReset: jest.fn(),
};
const mockLogService = { log: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };

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
    mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(1);
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
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const REGISTER_DTO = {
      email: 'new@example.com',
      password: 'Password123!',
      fullName: 'New User',
      termsAccepted: true,
    };

    it('forwards businessName to UsersService.create when provided', async () => {
      mockUsersService.create.mockResolvedValue({ ...TEST_USER, email: REGISTER_DTO.email });

      await service.register({ ...REGISTER_DTO, businessName: 'Ben Clothing' });

      expect(mockUsersService.create).toHaveBeenCalledWith(expect.objectContaining({ businessName: 'Ben Clothing' }));
    });

    it('forwards undefined businessName when omitted', async () => {
      mockUsersService.create.mockResolvedValue({ ...TEST_USER, email: REGISTER_DTO.email });

      await service.register(REGISTER_DTO);

      expect(mockUsersService.create).toHaveBeenCalledWith(expect.objectContaining({ businessName: undefined }));
    });

    it('emits USER_SIGNED_UP with the new user id on success', async () => {
      mockUsersService.create.mockResolvedValue({ ...TEST_USER, email: REGISTER_DTO.email });

      await service.register(REGISTER_DTO);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(APP_EVENTS.USER_SIGNED_UP, expect.any(UserSignedUpEvent));
      const emittedEvent = mockEventEmitter.emit.mock.calls[0][1] as UserSignedUpEvent;
      expect(emittedEvent.userId).toBe(TEST_USER.id);
    });

    it('does not emit USER_SIGNED_UP when user creation fails', async () => {
      mockUsersService.create.mockRejectedValue(new Error('DB error'));

      await expect(service.register(REGISTER_DTO)).rejects.toThrow();

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
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

      expect.assertions(4);
      try {
        await service.login(LOGIN_DTO);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.LOCKED);
        expect(httpErr.message).toBe(SYS_MSG.AUTH_ACCOUNT_LOCKED);
      }

      expect(bcrypt.compare).not.toHaveBeenCalled();
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
    it('atomically increments failed_attempts on wrong password and throws 401', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(3);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockAuthMetadataModelAction.incrementFailedAttempts).toHaveBeenCalledWith(TEST_USER.id);
      expect(mockAuthMetadataModelAction.updateByUserId).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ locked_until: expect.any(Date) }),
      );
    });

    it('locks the account when atomic increment reaches threshold and throws 423', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(5);
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
        expect.objectContaining({ locked_until: expect.any(Date) }),
      );
    });

    it('sets locked_until ~1 hour in the future on lock', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(5);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const before = Date.now();
      await service.login(LOGIN_DTO).catch(() => undefined);
      const after = Date.now();

      const [, updatePayload] = mockAuthMetadataModelAction.updateByUserId.mock.calls[0] as [
        string,
        { locked_until: Date },
      ];
      const lockedUntil = updatePayload.locked_until;
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
        expect.objectContaining({ failed_attempts: 0, locked_until: null }),
      );
      const [, loginPayload] = mockAuthMetadataModelAction.updateByUserId.mock.calls[0] as [
        string,
        { last_login_at: unknown },
      ];
      expect(loginPayload.last_login_at).toBeInstanceOf(Date);
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

  describe('admin audit logging (BE-ADM-609)', () => {
    it('AC-06: register records a signup success entry', async () => {
      mockUsersService.create.mockResolvedValue({ ...TEST_USER, email: 'new@example.com' });

      await service.register({
        email: 'new@example.com',
        password: 'Password123!',
        fullName: 'New User',
        termsAccepted: true,
      });

      expect(mockLogService.log).toHaveBeenCalledWith(
        TEST_USER.id,
        AdminLogActionType.SIGNUP,
        expect.any(String),
        null,
        AdminLogStatus.SUCCESS,
      );
    });

    it('AC-01: successful login records a login success entry', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login(LOGIN_DTO);

      expect(mockLogService.log).toHaveBeenCalledWith(
        TEST_USER.id,
        AdminLogActionType.LOGIN,
        expect.any(String),
        null,
        AdminLogStatus.SUCCESS,
      );
    });

    it('AC-02: wrong password records a login failed entry for the user', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(1);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockLogService.log).toHaveBeenCalledWith(
        TEST_USER.id,
        AdminLogActionType.LOGIN,
        expect.any(String),
        null,
        AdminLogStatus.FAILED,
      );
    });

    it('EC-02: unknown email records a login failed entry with a null user_id', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockLogService.log).toHaveBeenCalledWith(
        null,
        AdminLogActionType.LOGIN,
        expect.any(String),
        null,
        AdminLogStatus.FAILED,
      );
    });

    it('logout records a logout success entry', async () => {
      await service.logout(TEST_USER.id, 'sess-1');

      expect(mockLogService.log).toHaveBeenCalledWith(
        TEST_USER.id,
        AdminLogActionType.LOGOUT,
        expect.any(String),
        null,
        AdminLogStatus.SUCCESS,
      );
    });

    it('forwards the request object so the IP address can be recorded', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const req = { ip: '203.0.113.9', headers: {} } as unknown as import('express').Request;

      await service.login(LOGIN_DTO, req);

      expect(mockLogService.log).toHaveBeenCalledWith(
        TEST_USER.id,
        AdminLogActionType.LOGIN,
        expect.any(String),
        req,
        AdminLogStatus.SUCCESS,
      );
    });

    it('does not record an audit entry when login fails because the email is unverified', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...TEST_USER, is_verified: false });

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockLogService.log).not.toHaveBeenCalled();
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

  describe('M-1: ensureAuthMetadata concurrent first-login guard', () => {
    it('returns the row created by a concurrent request on unique-constraint collision', async () => {
      const concurrentMeta = buildMetadata();
      mockAuthMetadataModelAction.findByUserId.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrentMeta);
      mockAuthMetadataModelAction.createForUser.mockRejectedValueOnce({
        driverError: { code: '23505' },
      });
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(1);
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // login fails on password but ensureAuthMetadata must not throw
      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockAuthMetadataModelAction.createForUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('M-2: atomic failed_attempts increment', () => {
    it('does not set locked_until when increment count is below threshold', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(2);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(LOGIN_DTO)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockAuthMetadataModelAction.updateByUserId).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ locked_until: expect.any(Date) }),
      );
    });

    it('sets locked_until and throws 423 when increment reaches threshold', async () => {
      mockUsersService.findByEmail.mockResolvedValue(TEST_USER);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
      mockAuthMetadataModelAction.incrementFailedAttempts.mockResolvedValue(5);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(LOGIN_DTO)).rejects.toMatchObject({ status: HttpStatus.LOCKED });

      expect(mockAuthMetadataModelAction.updateByUserId).toHaveBeenCalledWith(
        TEST_USER.id,
        expect.objectContaining({ locked_until: expect.any(Date) }),
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
        avatarrl: 'https://example.com/avatar.png',
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
        fullName: 'Google User',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(mockUsersService.createGoogleAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new.google@example.com',
          providerUserId: 'google-123',
        }),
      );
      expect(result).toMatchObject({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
        accessToken: 'signed.jwt.token',
        refreshToken: 'signed.jwt.token',
      });
    });

    it('AC-01: throws ConflictException when the email belongs to a local account', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...TEST_USER,
        auth_provider: 'local',
        provider_user_id: null,
      });

      await expect(
        service.handleOAuthLogin({
          provider: 'google',
          providerId: 'google-456',
          email: TEST_USER.email,
          fullName: TEST_USER.full_name,
          avatarUrl: null,
        }),
      ).rejects.toThrow(new ConflictException(SYS_MSG.GOOGLE_EMAIL_ALREADY_LOCAL_ACCOUNT));
    });

    it('AC-02: succeeds when an existing Google account uses the same providerId', async () => {
      const googleUser = {
        ...TEST_USER,
        auth_provider: 'google',
        provider_user_id: 'google-123',
        password_hash: null,
      };
      mockUsersService.findByEmail.mockResolvedValue(googleUser);
      mockUsersService.updateGoogleAccount.mockResolvedValue(googleUser);

      const result = await service.handleOAuthLogin({
        provider: 'google',
        providerId: 'google-123',
        email: TEST_USER.email,
        fullName: TEST_USER.full_name,
        avatarUrl: null,
      });

      expect(result).toMatchObject({ statusCode: HttpStatus.OK, message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL });
    });

    it('AC-03: throws GOOGLE_ACCOUNT_LINK_CONFLICT when a Google account has a different providerId', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...TEST_USER,
        auth_provider: 'google',
        provider_user_id: 'google-OTHER',
        password_hash: null,
      });

      await expect(
        service.handleOAuthLogin({
          provider: 'google',
          providerId: 'google-NEW',
          email: TEST_USER.email,
          fullName: TEST_USER.full_name,
          avatarUrl: null,
        }),
      ).rejects.toThrow(new ConflictException(SYS_MSG.GOOGLE_ACCOUNT_LINK_CONFLICT));
    });

    it('AC-04: throws ConflictException in concurrent fallback when the race-created account is local', async () => {
      const uniqueConstraintError = { driverError: { code: '23505' } };
      mockUsersService.findByEmail.mockResolvedValueOnce(null);
      mockUsersService.createGoogleAccount.mockRejectedValueOnce(uniqueConstraintError);
      mockUsersService.findByEmail.mockResolvedValueOnce({
        ...TEST_USER,
        auth_provider: 'local',
        provider_user_id: null,
      });

      await expect(
        service.handleOAuthLogin({
          provider: 'google',
          providerId: 'google-456',
          email: TEST_USER.email,
          fullName: TEST_USER.full_name,
          avatarUrl: null,
        }),
      ).rejects.toThrow(new ConflictException(SYS_MSG.GOOGLE_EMAIL_ALREADY_LOCAL_ACCOUNT));
    });

    it('SEC-01: updateGoogleAccount is never called when the existing account is local', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...TEST_USER,
        auth_provider: 'local',
        provider_user_id: null,
      });

      await service
        .handleOAuthLogin({
          provider: 'google',
          providerId: 'google-456',
          email: TEST_USER.email,
          fullName: TEST_USER.full_name,
          avatarUrl: null,
        })
        .catch(() => null);

      expect(mockUsersService.updateGoogleAccount).not.toHaveBeenCalled();
    });

    it('AC-04: throws ACCOUNT_EXISTS_WITH_RETENTION when a soft-deleted account holds the email', async () => {
      mockUsersService.findByEmail.mockResolvedValueOnce(null);
      mockUsersService.findByEmailWithDeleted.mockResolvedValueOnce({
        ...TEST_USER,
        deleted_at: new Date('2026-01-01'),
      });

      await expect(
        service.handleOAuthLogin({
          provider: 'google',
          providerId: 'google-456',
          email: TEST_USER.email,
          fullName: TEST_USER.full_name,
          avatarUrl: null,
        }),
      ).rejects.toThrow(new ConflictException(SYS_MSG.ACCOUNT_EXISTS_WITH_RETENTION));

      expect(mockUsersService.createGoogleAccount).not.toHaveBeenCalled();
    });

    it('AC-05: throws ACCOUNT_EXISTS_WITH_RETENTION in concurrent fallback when soft-deleted account causes the 23505', async () => {
      const uniqueConstraintError = { driverError: { code: '23505' } };
      mockUsersService.findByEmail
        .mockResolvedValueOnce(null) // initial check — no active user
        .mockResolvedValueOnce(null); // concurrent fallback — still no active user
      mockUsersService.findByEmailWithDeleted
        .mockResolvedValueOnce(null) // pre-check passes (soft-deleted check before createGoogleAccount)
        .mockResolvedValueOnce({ ...TEST_USER, deleted_at: new Date() }); // fallback finds soft-deleted
      mockUsersService.createGoogleAccount.mockRejectedValueOnce(uniqueConstraintError);

      await expect(
        service.handleOAuthLogin({
          provider: 'google',
          providerId: 'google-456',
          email: TEST_USER.email,
          fullName: TEST_USER.full_name,
          avatarUrl: null,
        }),
      ).rejects.toThrow(new ConflictException(SYS_MSG.ACCOUNT_EXISTS_WITH_RETENTION));
    });
  });

  describe('Google OAuth Short-lived Exchange Flow', () => {
    const mockProfile = {
      provider: 'google' as const,
      providerId: 'google-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      avatarUrl: null,
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
        expect(mockRedisService.setStrict).toHaveBeenCalledWith(`oauth:exchange:${code}`, expect.any(String), 60);

        const exchangeCall = (mockRedisService.setStrict.mock.calls as [string, string, number][]).find(
          ([key]) => key === `oauth:exchange:${code}`,
        );

        const storedData = JSON.parse(exchangeCall?.[1] ?? '{}') as { accessToken: string; refreshToken: string };
        expect(storedData).toMatchObject({
          accessToken: 'signed.jwt.token',
          refreshToken: 'signed.jwt.token',
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

  const mockUsersService = {
    findByEmail: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockRedisService = {
    incr: jest.fn(),
    expire: jest.fn(),
    rateLimit: jest.fn(),
    del: jest.fn(),
    releaseLock: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    getdel: jest.fn(),
    setNx: jest.fn(),
    setStrict: jest.fn(),
  };

  const mockUserSessionModelAction = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
    createSession: jest.fn(),
  };

  const mockAuthMetadataModelAction = {
    findByUserId: jest.fn(),
    updateByUserId: jest.fn(),
    createForUser: jest.fn(),
    incrementFailedAttempts: jest.fn(),
  };

  const mockOtpTokenModelAction = {
    findByUserAndType: jest.fn(),
    replaceToken: jest.fn(),
    delete: jest.fn(),
  };

  const mockEmailService = {
    sendPasswordReset: jest.fn(),
    sendOtpVerification: jest.fn(),
    sendOtpReset: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJwtService.signAsync.mockResolvedValue('signed.jwt.token');
    mockRedisService.set.mockResolvedValue('OK');
    mockRedisService.setNx.mockResolvedValue(1);
    mockRedisService.setStrict.mockResolvedValue(undefined);
    mockEmailService.sendPasswordReset.mockResolvedValue({ id: 'email-job-id' });

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
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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

      const [replaceCall] = mockOtpTokenModelAction.replaceToken.mock.calls[0] as [{ expires_at: Date }];
      const expiresAt = replaceCall.expires_at.getTime();
      const after = Date.now();

      expect(expiresAt).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
    });

    it('AC-04: rate limits to 3 requests per 15 minutes', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockRedisService.incr.mockResolvedValue(4);

      await expect(service.forgotPassword(USER_EMAIL)).rejects.toThrow(SYS_MSG.PASSWORD_RESET_RATE_LIMITED);
    });
  });

  describe('verifyResetOtp', () => {
    const RESET_TOKEN = 'signed.reset.token';

    beforeEach(() => {
      mockRedisService.rateLimit.mockResolvedValue({ exceeded: false });
      mockRedisService.setNx.mockResolvedValue(1);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.signAsync.mockResolvedValue(RESET_TOKEN);
    });

    it('returns a reset_token when OTP is valid', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);

      const result = await service.verifyResetOtp(USER_EMAIL, OTP_CODE);

      expect(result).toHaveProperty('reset_token', RESET_TOKEN);
    });

    it('throws 400 when user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.verifyResetOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
    });

    it('throws 429 when rate limit exceeded', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockRedisService.rateLimit.mockResolvedValue({ exceeded: true });

      await expect(service.verifyResetOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED,
      );
    });

    it('throws 400 when no OTP token exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(null);

      await expect(service.verifyResetOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
    });

    it('throws 400 when OTP is expired', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue({
        ...validOtpToken,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(service.verifyResetOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(SYS_MSG.PASSWORD_RESET_EXPIRED);
    });

    it('throws 400 when OTP code does not match', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.verifyResetOtp(USER_EMAIL, OTP_CODE)).rejects.toThrow(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
    });

    it('deletes the OTP token after successful verification', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);

      await service.verifyResetOtp(USER_EMAIL, OTP_CODE);

      expect(mockOtpTokenModelAction.delete).toHaveBeenCalled();
    });

    it('acquires the lock with a per-request token and 30-second TTL (M-3)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(validUser);
      mockOtpTokenModelAction.findByUserAndType.mockResolvedValue(validOtpToken);

      await service.verifyResetOtp(USER_EMAIL, OTP_CODE);

      const [lockKey, lockToken, ttl] = mockRedisService.setNx.mock.calls.find(([k]: [string]) =>
        k.includes('password-reset:verify:lock:'),
      ) as [string, string, number];
      expect(lockKey).toContain('password-reset:verify:lock:');
      expect(typeof lockToken).toBe('string');
      expect(lockToken).not.toBe('1');
      expect(ttl).toBe(30);
    });
  });

  describe('resetPassword', () => {
    const RESET_TOKEN = 'valid.reset.token';
    const VALID_JTI = 'test-jti-uuid-1234';
    const VALID_PAYLOAD = { sub: USER_ID, userId: USER_ID, type: 'password_reset', jti: VALID_JTI };

    beforeEach(() => {
      mockJwtService.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      mockUsersService.findById.mockResolvedValue(validUser);
      mockUserSessionModelAction.findByUserId.mockResolvedValue([]);
      mockJwtService.signAsync.mockResolvedValue('new.jwt.token');
      mockUserSessionModelAction.createSession.mockResolvedValue({ id: 'new-session' });
      mockUsersService.update.mockResolvedValue({ ...validUser });
      mockRedisService.setStrict.mockResolvedValue(undefined);
      mockRedisService.getdel.mockResolvedValue(VALID_JTI);
    });

    it('AC-06: successfully resets password and auto-logs in user', async () => {
      const result = await service.resetPassword(RESET_TOKEN, NEW_PASSWORD);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
    });

    it('AC-07: throws 400 when reset token is invalid or expired', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.resetPassword(RESET_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_INVALID_TOKEN,
      );
    });

    it('AC-07: throws 400 when token type is not password_reset', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ userId: USER_ID, type: 'access', jti: VALID_JTI });

      await expect(service.resetPassword(RESET_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_INVALID_TOKEN,
      );
    });

    it('AC-08: throws 400 when JTI has already been consumed (replay attempt)', async () => {
      mockRedisService.getdel.mockResolvedValue(null);

      await expect(service.resetPassword(RESET_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_INVALID_TOKEN,
      );
    });

    it('AC-08: throws 400 when JTI does not match token payload (token swapped)', async () => {
      mockRedisService.getdel.mockResolvedValue('different-jti');

      await expect(service.resetPassword(RESET_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_INVALID_TOKEN,
      );
    });

    it('AC-09: throws 400 when user no longer exists', async () => {
      mockUsersService.findById.mockRejectedValue(new NotFoundException('not found'));

      await expect(service.resetPassword(RESET_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        SYS_MSG.PASSWORD_RESET_INVALID_TOKEN,
      );
    });

    it('AC-11: revokes all existing user sessions after password change', async () => {
      const sessions = [
        { id: 'session-1', is_revoked: false },
        { id: 'session-2', is_revoked: false },
      ];
      mockUserSessionModelAction.findByUserId.mockResolvedValue(sessions);
      mockUserSessionModelAction.updateById.mockResolvedValue({});

      await service.resetPassword(RESET_TOKEN, NEW_PASSWORD);

      const revokedCalls = (
        mockUserSessionModelAction.updateById.mock.calls as [string, { is_revoked?: boolean }][]
      ).filter(([, payload]) => payload.is_revoked === true);
      expect(revokedCalls.length).toBe(2);
    });

    it('AC-13: issues new access and refresh tokens for auto-login', async () => {
      mockJwtService.signAsync.mockResolvedValue('brand-new-jwt-token');

      const result = await service.resetPassword(RESET_TOKEN, NEW_PASSWORD);

      expect(mockJwtService.signAsync).toHaveBeenCalled();
      expect(result.accessToken).toBe('brand-new-jwt-token');
    });

    it('AC-14: updates password via usersService.update', async () => {
      await service.resetPassword(RESET_TOKEN, NEW_PASSWORD);

      expect(mockUsersService.update).toHaveBeenCalledWith(USER_ID, { password: NEW_PASSWORD });
    });
  });
});

describe('AuthService - refresh() rate limit (BE-64)', () => {
  let service: AuthService;

  const REFRESH_PAYLOAD = {
    sub: 'user-uuid-1',
    userId: 'user-uuid-1',
    email: 'jane@example.com',
    sessionId: 'session-uuid-1',
  };

  const mockJwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const mockRedisService = { rateLimit: jest.fn(), setStrict: jest.fn(), del: jest.fn() };
  const mockUserSessionModelAction = { findById: jest.fn(), updateById: jest.fn(), createSession: jest.fn() };
  const mockUsersService = { findById: jest.fn() };
  const mockAuthMetadataModelAction = { findByUserId: jest.fn(), updateByUserId: jest.fn(), createForUser: jest.fn() };
  const mockOtpTokenModelAction = { replaceToken: jest.fn() };
  const mockEmailService = { sendOtpVerification: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJwtService.verifyAsync.mockResolvedValue(REFRESH_PAYLOAD);
    mockRedisService.rateLimit.mockResolvedValue({ exceeded: false, count: 1 });

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
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('RL-01: throws 429 when the per-user refresh rate limit is exceeded', async () => {
    mockRedisService.rateLimit.mockResolvedValue({ exceeded: true, count: 11 });

    await expect(service.refresh('any.refresh.token')).rejects.toThrow(HttpException);
    await expect(service.refresh('any.refresh.token')).rejects.toMatchObject({
      message: SYS_MSG.AUTH_REFRESH_RATE_LIMITED,
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('RL-02: proceeds past rate limit check when limit is not exceeded', async () => {
    mockRedisService.rateLimit.mockResolvedValue({ exceeded: false, count: 1 });
    mockUserSessionModelAction.findById.mockResolvedValue(null);

    await expect(service.refresh('any.refresh.token')).rejects.toThrow(UnauthorizedException);
  });
});
