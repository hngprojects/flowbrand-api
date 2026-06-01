import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AdminAuthService } from '../admin-auth.service';
import { AuthMetadataModelAction } from '../../../auth/actions/auth-metadata.action';
import { RedisService } from '../../../redis/redis.service';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../../users/actions/user-session.action';
import { UserSession } from '../../../users/entities/user-session.entity';
import { UserRole } from '../../../users/enums/user-role.enum';
import { UsersService } from '../../../users/users.service';
import * as SYS_MSG from '../../../../constants/system.messages';

jest.mock('bcrypt');

const mockUsersService = { findByEmail: jest.fn() };
const mockJwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
const mockRedisService = { setStrict: jest.fn(), del: jest.fn() };
const mockUserRoleModelAction = { resolveHighestRole: jest.fn() };
const mockUserSessionModelAction = { createSession: jest.fn(), updateById: jest.fn() };
const mockAuthMetadataModelAction = {
  findByUserId: jest.fn(),
  updateByUserId: jest.fn(),
  createForUser: jest.fn(),
};
const mockSessionRepository = { findOne: jest.fn() };

const ADMIN_USER = {
  id: 'admin-uuid-1',
  email: 'admin@example.com',
  full_name: 'Admin User',
  password_hash: '$2b$12$hash',
  is_active: true,
  is_verified: true,
  deleted_at: null,
};

const LOGIN_DTO = { email: ADMIN_USER.email, password: 'Admin@Pass1!' };

function buildMetadata(overrides: Record<string, unknown> = {}) {
  return {
    id: 'meta-uuid-1',
    user_id: ADMIN_USER.id,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    ...overrides,
  };
}

describe('AdminAuthService', () => {
  let service: AdminAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-token');

    mockJwtService.signAsync.mockResolvedValue('signed.jwt.token');
    mockUserSessionModelAction.createSession.mockResolvedValue({ id: 'sess-1' });
    mockUserSessionModelAction.updateById.mockResolvedValue(null);
    mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata());
    mockAuthMetadataModelAction.updateByUserId.mockResolvedValue(null);
    mockRedisService.setStrict.mockResolvedValue(undefined);
    mockRedisService.del.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: AuthMetadataModelAction, useValue: mockAuthMetadataModelAction },
        { provide: getRepositoryToken(UserSession), useValue: mockSessionRepository },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
  });

  describe('login', () => {
    it('returns access + refresh tokens for valid admin credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);

      const result = await service.login(LOGIN_DTO);

      expect(result).toEqual({ accessToken: 'signed.jwt.token', refreshToken: 'signed.jwt.token' });
    });

    it('embeds super_admin role in the JWT payload for super-admin credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.SUPER_ADMIN);

      await service.login(LOGIN_DTO);

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.SUPER_ADMIN }),
        expect.anything(),
      );
    });

    it('throws 401 with the same message when user does not exist', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(LOGIN_DTO)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS),
      );
    });

    it('throws 401 with the same message when user has no admin role', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.USER);

      await expect(service.login(LOGIN_DTO)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS),
      );
    });

    it('throws 401 with the same message when admin is soft-deleted', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...ADMIN_USER,
        deleted_at: new Date('2024-01-01'),
      });

      await expect(service.login(LOGIN_DTO)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS),
      );
    });

    it('throws 401 on wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(LOGIN_DTO)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS),
      );
    });

    it('throws 423 when account is locked', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(
        buildMetadata({ locked_until: new Date(Date.now() + 30 * 60 * 1000) }),
      );

      await expect(service.login(LOGIN_DTO)).rejects.toThrow(
        new HttpException(SYS_MSG.ADMIN_ACCOUNT_LOCKED, HttpStatus.LOCKED),
      );
    });

    it('sets locked_until ~1 hour in the future on the 5th failed attempt', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata({ failed_attempts: 4 }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const before = Date.now();
      await expect(service.login(LOGIN_DTO)).rejects.toThrow(HttpException);

      const [[, updatePayload]] = mockAuthMetadataModelAction.updateByUserId.mock.calls;
      expect(updatePayload.failed_attempts).toBe(5);
      expect(updatePayload.locked_until.getTime()).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
    });

    it('resets failed_attempts to 0 on successful login', async () => {
      mockUsersService.findByEmail.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
      mockAuthMetadataModelAction.findByUserId.mockResolvedValue(buildMetadata({ failed_attempts: 2 }));

      await service.login(LOGIN_DTO);

      expect(mockAuthMetadataModelAction.updateByUserId).toHaveBeenCalledWith(
        ADMIN_USER.id,
        expect.objectContaining({ failed_attempts: 0, locked_until: null }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the session in DB and deletes both Redis keys', async () => {
      await service.logout(ADMIN_USER.id, 'sess-1');

      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({ is_revoked: true }),
      );
      expect(mockRedisService.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshToken', () => {
    const REFRESH_TOKEN = 'valid.refresh.token';
    const SESSION = {
      id: 'sess-1',
      user_id: ADMIN_USER.id,
      refresh_token: 'hashed-token',
      is_revoked: false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    beforeEach(() => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: ADMIN_USER.id,
        userId: ADMIN_USER.id,
        email: ADMIN_USER.email,
        sessionId: 'sess-1',
        role: UserRole.ADMIN,
      });
      mockSessionRepository.findOne.mockResolvedValue(SESSION);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
    });

    it('throws 401 when the session is revoked (not found by is_revoked=false query)', async () => {
      mockSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshToken(REFRESH_TOKEN)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN),
      );
    });

    it('throws 401 when the user no longer has an admin role', async () => {
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.USER);

      await expect(service.refreshToken(REFRESH_TOKEN)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN),
      );
    });

    it('returns new tokens with the correct role claim on valid refresh', async () => {
      const result = await service.refreshToken(REFRESH_TOKEN);

      expect(result).toEqual({ accessToken: 'signed.jwt.token', refreshToken: 'signed.jwt.token' });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ADMIN }),
        expect.anything(),
      );
    });
  });
});
