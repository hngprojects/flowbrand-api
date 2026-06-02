import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminRequest } from '../../admin/interfaces/admin-request.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../redis/redis.service';
import { AdminJwtGuard } from './admin-jwt.guard';

const mockJwtService = { verifyAsync: jest.fn() };
const mockRedisService = { get: jest.fn() };
const mockUsersService = { findById: jest.fn() };

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
  let roleRepository: { find: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    roleRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminJwtGuard,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: getRepositoryToken(UserRoleEntity), useValue: roleRepository },
      ],
    }).compile();

    guard = module.get<AdminJwtGuard>(AdminJwtGuard);

    mockRedisService.get.mockResolvedValue(JSON.stringify({ ok: true }));
    mockUsersService.findById.mockResolvedValue({
      id: 'user-1',
      deleted_at: null,
      is_active: true,
    });
    roleRepository.find.mockResolvedValue([{ role: UserRole.ADMIN }]);
  });

  it('AC-06: rejects non-admin JWT with 403', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: UserRole.ADMIN,
    });
    roleRepository.find.mockResolvedValue([]);

    const { ctx } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(SYS_MSG.ADMIN_ACCESS_DENIED),
    );
  });

  it('allows admin JWT', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
    });
    roleRepository.find.mockResolvedValue([{ role: UserRole.ADMIN }]);

    const { ctx, request } = buildContext('Bearer valid.token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ role: UserRole.ADMIN, sub: 'user-1' });
  });

  it('rejects missing Authorization header with 401', async () => {
    const { ctx } = buildContext();

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
