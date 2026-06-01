import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { env } from '../../../config/env';
import * as SYS_MSG from '../../../constants/system.messages';
import { redisKeys } from '../../../constants/redis-keys';
import { AuthMetadataModelAction } from '../../auth/actions/auth-metadata.action';
import type { AuthMetadata } from '../../auth/entities/auth-metadata.entity';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { RedisService } from '../../redis/redis.service';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { UserSession } from '../../users/entities/user-session.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UsersService } from '../../users/users.service';
import { AdminLoginDto } from './dto/admin-login.dto';

const REDIS_SESSION_TTL_SECONDS = 15 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 60 * 60 * 1000;
const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

// Pre-computed dummy hash used to keep user-not-found timing equal to wrong-password timing.
const DUMMY_HASH = '$2b$12$invalidhashpadding00000000000000000000000000000000000000';

export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly authMetadataModelAction: AuthMetadataModelAction,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
  ) {}

  private get authMetadataAction(): {
    findByUserId(userId: string): Promise<AuthMetadata | null>;
    updateByUserId(userId: string, payload: Partial<AuthMetadata>): Promise<AuthMetadata | null>;
    createForUser(payload: Partial<AuthMetadata>): Promise<AuthMetadata>;
  } {
    return this.authMetadataModelAction;
  }

  /** Validates admin credentials, enforces lockout, and issues a JWT with the role claim. */
  async login(dto: AdminLoginDto): Promise<AdminAuthTokens> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user?.password_hash) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS);
    }

    if (user.deleted_at !== null) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS);
    }

    const highestRole = await this.userRoleModelAction.resolveHighestRole(user.id);

    if (!highestRole || !ADMIN_ROLES.includes(highestRole)) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS);
    }

    const metadata = await this.ensureAuthMetadata(user.id);
    this.throwIfLocked(metadata);

    const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordMatches) {
      await this.recordFailedLogin(user.id, metadata);
      throw new UnauthorizedException(SYS_MSG.ADMIN_INVALID_CREDENTIALS);
    }

    await this.recordSuccessfulLogin(user.id);
    return this.issueTokens(user.id, user.email, highestRole);
  }

  /** Revokes the admin session from DB and Redis. */
  async logout(userId: string, sessionId: string): Promise<void> {
    if (!sessionId) return;

    await Promise.all([
      this.userSessionModelAction.updateById(sessionId, {
        is_revoked: true,
        revoked_at: new Date(),
      }),
      this.redisService.del(redisKeys.activeSession(userId, sessionId)),
      this.redisService.del(redisKeys.session(userId, sessionId)),
    ]);
  }

  /** Validates the refresh token cookie and issues a new token pair with the correct role claim. */
  async refreshToken(rawRefreshToken: string): Promise<AdminAuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(rawRefreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const session = await this.sessionRepository.findOne({
      where: {
        id: payload.sessionId,
        user_id: payload.sub,
        is_revoked: false,
      },
    });

    if (!session || session.expires_at < new Date()) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const tokenMatches = await bcrypt.compare(rawRefreshToken, session.refresh_token);
    if (!tokenMatches) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const highestRole = await this.userRoleModelAction.resolveHighestRole(payload.sub);
    if (!highestRole || !ADMIN_ROLES.includes(highestRole)) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    return this.issueTokens(payload.sub, payload.email, highestRole, session.id);
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: UserRole,
    existingSessionId?: string,
  ): Promise<AdminAuthTokens> {
    const sessionId = existingSessionId ?? (await this.createSession(userId));
    const jwtPayload: JwtPayload = { userId, sub: userId, email, sessionId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: env.JWT_ACCESS_SECRET,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue,
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN as StringValue,
      }),
    ]);

    await Promise.all([this.persistRefreshToken(sessionId, refreshToken), this.persistRedisSession(userId, sessionId)]);

    return { accessToken, refreshToken };
  }

  private async createSession(userId: string): Promise<string> {
    const placeholder = `temp-${Date.now()}`;
    const refreshTokenHash = await bcrypt.hash(placeholder, 10);

    const expiresAt = new Date();
    const raw = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace(/\D/g, ''), 10);
    const expiresIn = env.JWT_REFRESH_EXPIRES_IN.includes('d')
      ? raw * 24 * 60 * 60 * 1000
      : env.JWT_REFRESH_EXPIRES_IN.includes('h')
        ? raw * 60 * 60 * 1000
        : raw * 1000;
    expiresAt.setTime(expiresAt.getTime() + expiresIn);

    const session = await this.userSessionModelAction.createSession({
      user_id: userId,
      refresh_token: refreshTokenHash,
      expires_at: expiresAt,
      is_revoked: false,
    });
    return session.id;
  }

  private async persistRefreshToken(sessionId: string, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.userSessionModelAction.updateById(sessionId, { refresh_token: hash });
  }

  private async persistRedisSession(userId: string, sessionId: string): Promise<void> {
    const value = JSON.stringify({ userId, sessionId });
    await Promise.all([
      this.redisService.setStrict(redisKeys.activeSession(userId, sessionId), value, REDIS_SESSION_TTL_SECONDS),
      this.redisService.setStrict(redisKeys.session(userId, sessionId), value, REDIS_SESSION_TTL_SECONDS),
    ]);
  }

  private async ensureAuthMetadata(userId: string): Promise<AuthMetadata> {
    const existing = await this.authMetadataAction.findByUserId(userId);
    if (existing) return existing;
    return this.authMetadataAction.createForUser({
      user_id: userId,
      failed_attempts: 0,
      locked_until: null,
      last_login_at: null,
    });
  }

  private throwIfLocked(metadata: AuthMetadata): void {
    if (metadata.locked_until && metadata.locked_until.getTime() > Date.now()) {
      throw new HttpException(SYS_MSG.ADMIN_ACCOUNT_LOCKED, HttpStatus.LOCKED);
    }
  }

  private async recordFailedLogin(userId: string, metadata: AuthMetadata): Promise<void> {
    const nextAttempts = metadata.failed_attempts + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : metadata.locked_until;

    await this.authMetadataAction.updateByUserId(userId, {
      failed_attempts: nextAttempts,
      locked_until: lockedUntil,
    });

    if (shouldLock) {
      this.logger.warn({ message: 'Admin account locked after max failed attempts', userId });
      throw new HttpException(SYS_MSG.ADMIN_ACCOUNT_LOCKED, HttpStatus.LOCKED);
    }
  }

  private async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.authMetadataAction.updateByUserId(userId, {
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date(),
    });
  }
}
