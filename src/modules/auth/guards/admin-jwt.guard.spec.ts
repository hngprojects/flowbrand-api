import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminRequest } from '../../admin/interfaces/admin-request.interface';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { UserRole } from '../../users/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../redis/redis.service';
import { AdminJwtGuard } from './admin-jwt.guard';

const mockJwtService = { verifyAsync: jest.fn() };
const mockRedisService = { get: jest.fn() };
const mockUsersService = { findById: jest.fn() };
const mockUserSessionAction = { findById: jest.fn() };
const mockUserRoleModelAction = { resolveHighestRole: jest.fn() };

function buildContext(authHeader?: string): {
  ctx: ExecutionContext;
  request: AdminRequest;
} {
  const request = {
    headers: { authorization: authHeader },
  } as unknown as AdminRequest;

  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { ctx, request };
}

describe('AdminJwtGuard', () => {
  let guard: AdminJwtGuard;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminJwtGuard,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: UserSessionModelAction, useValue: mockUserSessionAction },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
      ],
    }).compile();

    guard = module.get<AdminJwtGuard>(AdminJwtGuard);

    mockRedisService.get.mockResolvedValue(JSON.stringify({ ok: true }));
    mockUsersService.findById.mockResolvedValue({
      id: 'user-1',
      deleted_at: null,
      is_active: true,
    });
    mockUserSessionAction.findById.mockResolvedValue({
      id: 'sess-1',
      user_id: 'user-1',
      is_revoked: false,
    });
    mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
  });

  it('AC-06: rejects non-admin JWT with 403', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: UserRole.USER,
    });
    mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.USER);

    const { ctx } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(SYS_MSG.ADMIN_ACCESS_DENIED),
    );
  });

  it('allows admin JWT even when the token role claim is stale', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
    });

    const { ctx, request } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ role: UserRole.ADMIN, sub: 'user-1' });
    expect(mockUserSessionAction.findById).toHaveBeenCalledWith('sess-1');
    expect(mockUserRoleModelAction.resolveHighestRole).toHaveBeenCalledWith('user-1');
  });

  it('rejects a revoked database session even if Redis still has the session key', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: UserRole.ADMIN,
    });
    mockUserSessionAction.findById.mockResolvedValue({
      id: 'sess-1',
      user_id: 'user-1',
      is_revoked: true,
    });

    const { ctx } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing Authorization header with 401', async () => {
    const { ctx } = buildContext();

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminRequest } from '../../admin/interfaces/admin-request.interface';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { UserRole } from '../../users/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../redis/redis.service';
import { AdminJwtGuard } from './admin-jwt.guard';

const mockJwtService = { verifyAsync: jest.fn() };
const mockRedisService = { get: jest.fn() };
const mockUsersService = { findById: jest.fn() };
const mockUserSessionAction = { findById: jest.fn() };
const mockUserRoleModelAction = { resolveHighestRole: jest.fn() };

function buildContext(authHeader?: string): {
  ctx: ExecutionContext;
  request: AdminRequest;
} {
  const request = {
    headers: { authorization: authHeader },
  } as unknown as AdminRequest;

  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { ctx, request };
}

describe('AdminJwtGuard', () => {
  let guard: AdminJwtGuard;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminJwtGuard,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: UserSessionModelAction, useValue: mockUserSessionAction },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
      ],
    }).compile();

    guard = module.get<AdminJwtGuard>(AdminJwtGuard);

    mockRedisService.get.mockResolvedValue(JSON.stringify({ ok: true }));
    mockUsersService.findById.mockResolvedValue({
      id: 'user-1',
      deleted_at: null,
      is_active: true,
    });
    mockUserSessionAction.findById.mockResolvedValue({
      id: 'sess-1',
      user_id: 'user-1',
      is_revoked: false,
    });
    mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
  });

  it('AC-06: rejects non-admin JWT with 403', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: UserRole.USER,
    });
    mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.USER);

    const { ctx } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(SYS_MSG.ADMIN_ACCESS_DENIED),
    );
  });

  it('allows admin JWT even when the token role claim is stale', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
    });

    const { ctx, request } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ role: UserRole.ADMIN, sub: 'user-1' });
    expect(mockUserSessionAction.findById).toHaveBeenCalledWith('sess-1');
    expect(mockUserRoleModelAction.resolveHighestRole).toHaveBeenCalledWith('user-1');
  });

  it('rejects a revoked database session even if Redis still has the session key', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: UserRole.ADMIN,
    });
    mockUserSessionAction.findById.mockResolvedValue({
      id: 'sess-1',
      user_id: 'user-1',
      is_revoked: true,
    });

    const { ctx } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing Authorization header with 401', async () => {
    const { ctx } = buildContext();

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
