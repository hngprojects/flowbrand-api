import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { jwtConfig } from '../../../config/jwt.config';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminRequest } from '../../admin/interfaces/admin-request.interface';
import { RedisService } from '../../redis/redis.service';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../strategies/jwt.strategy';

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
 
    if (isPublic) return true;
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

    const roleRows = await this.userRoleRepository.find({
      where: ADMIN_ROLES.map((role) => ({ user_id: userId, role })),
    });

    if (!roleRows.length) {
      throw new ForbiddenException(SYS_MSG.ADMIN_ACCESS_DENIED);
    }

    const currentRole = roleRows.some((r) => r.role === UserRole.SUPER_ADMIN)
      ? UserRole.SUPER_ADMIN
      : UserRole.ADMIN;

    request.user = { ...payload, role: currentRole };
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
