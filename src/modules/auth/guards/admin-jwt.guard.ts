import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { jwtConfig } from '../../../config/jwt.config';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminRequest } from '../../admin/interfaces/admin-request.interface';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../strategies/jwt.strategy';

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: jwtConfig().accessSecret,
      });
    } catch {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    const { sessionId, sub: userId } = payload;
    if (!sessionId) {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    const sessionData = await this.redisService.get(`sess:${userId}:${sessionId}`);
    if (!sessionData) {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    const user = await this.usersService.findById(userId).catch(() => null);
    if (!user || user.deleted_at !== null || !user.is_active) {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    // A token without an admin role claim is rejected with 403, not 401.
    // We never reveal that the role was the reason — same message for all denials.
    if (!payload.role || !ADMIN_ROLES.includes(payload.role)) {
      throw new ForbiddenException(SYS_MSG.ADMIN_ACCESS_DENIED);
    }

    request.user = payload;
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
