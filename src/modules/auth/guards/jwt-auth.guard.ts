import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { UsersService } from '../../users/users.service';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { jwtConfig } from '../../../config/jwt.config';
import { JwtPayload } from '../strategies/jwt.strategy';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  session?: Record<string, unknown>;
  token?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private redisService: RedisService,
    private userService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute) {
      return true;
    }

    if (!token) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
      );
    }

    let payload: JwtPayload | null;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: jwtConfig().accessSecret,
      });
    } catch {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
      );
    }

    if (!payload) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
      );
    }

    const { sessionId, sub: userId } = payload;

    if (!sessionId) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
      );
    }

    const sessionKeys = [
      `active_session:${userId}:${sessionId}`,
      `sess:${userId}:${sessionId}`,
    ];
    const sessionData =
      (await this.redisService.get(sessionKeys[0])) ??
      (await this.redisService.get(sessionKeys[1]));

    if (!sessionData) {
      this.logger.warn('Session not found or Redis unreachable');
      throw new UnauthorizedException(
        SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
      );
    }

    const user = await this.userService.findById(userId).catch(() => null);
    if (!user || user.deleted_at !== null || !user.is_active) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
      );
    }

    request.user = payload;
    request.session = JSON.parse(sessionData) as Record<string, unknown>;
    request.token = token;

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
