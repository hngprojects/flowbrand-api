import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserRole } from '../../modules/users/enums/user-role.enum';

export interface AuthenticatedUser {
  userId: string;
  sub: string;
  email: string;
  sessionId: string;
  role?: UserRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
