import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserRole } from '../../users/enums/user-role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows access when the user has a required admin role', () => {
    const guard = new RolesGuard(reflector);
    const request = { user: { role: UserRole.ADMIN } };

    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    (context.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws 403 when the user role does not match the required admin roles', () => {
    const guard = new RolesGuard(reflector);
    const request = { user: { role: UserRole.USER } };

    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    (context.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException(SYS_MSG.ADMIN_ACCESS_DENIED));
  });

  it('allows access when no roles metadata is present', () => {
    const guard = new RolesGuard(reflector);

    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });
});