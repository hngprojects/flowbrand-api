import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserSessionModelAction } from '../users/actions/user-session.action';
import { AuthMetadataModelAction } from './actions/auth-metadata.action';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import * as SYS_MSG from '../../constants/system.messages';
import { env } from '../../config/env';
import { User } from '../users/entities/user.entity';
import type { UserSession } from '../users/entities/user-session.entity';
import type { AuthMetadata } from './entities/auth-metadata.entity';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const REDIS_SESSION_TTL_SECONDS = 15 * 60;
const REDIS_SESSION_KEY_PREFIX = 'sess';
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 60 * 60 * 1000;

type SafeUser = Omit<
  User,
  | 'password_hash'
  | 'deletedAt'
  | 'deleted_at'
  | 'auth_metadata'
  | 'sessions'
  | 'roles'
>;

export interface AuthResponse extends AuthTokens {
  user: SafeUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly authMetadataModelAction: AuthMetadataModelAction,
  ) {}

  // Local minimal interface to avoid unsafe-call lint issues from third-party model action types
  private get userSessionAction(): {
    findById(id: string): Promise<UserSession | null>;
    updateById(id: string, payload: Partial<UserSession>): Promise<UserSession | null>;
    deleteById(id: string): Promise<void>;
    createSession(payload: Partial<UserSession>): Promise<UserSession>;
  } {
    return this.userSessionModelAction;
  }

  private get authMetadataAction(): {
    findByUserId(userId: string): Promise<AuthMetadata | null>;
    updateByUserId(
      userId: string,
      payload: Partial<AuthMetadata>,
    ): Promise<AuthMetadata | null>;
    createForUser(payload: Partial<AuthMetadata>): Promise<AuthMetadata>;
  } {
    return this.authMetadataModelAction;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (!dto.termsAccepted) {
      throw new BadRequestException(SYS_MSG.AUTH_TERMS_REQUIRED);
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      termsAccepted: true,
    });
    return this.issueTokens(user, { rollbackOnFailure: true });
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user?.password_hash) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_CREDENTIALS);
    }

    const metadata = await this.ensureAuthMetadata(user.id);
    this.throwIfLocked(metadata);

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      await this.recordFailedLogin(user.id, metadata);
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_CREDENTIALS);
    }

    await this.recordSuccessfulLogin(user.id);
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_INVALID_REFRESH_TOKEN,
      );
    }

    const session = await this.userSessionAction.findById(
      payload.sessionId,
    );

    if (!session || session.is_revoked) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_INVALID_REFRESH_TOKEN,
      );
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      session.refresh_token,
    );

    if (!tokenMatches) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_INVALID_REFRESH_TOKEN,
      );
    }

    const user = await this.usersService.findById(payload.sub);
    return this.issueTokens(user, session.id);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    if (!sessionId) return;

    const redisKey = `${REDIS_SESSION_KEY_PREFIX}:${userId}:${sessionId}`;
    await Promise.all([
      this.userSessionAction.updateById(sessionId, {
        is_revoked: true,
        revoked_at: new Date(),
      }),
      this.redisService.del(redisKey),
    ]);
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  private async issueTokens(
    user: User,
    optionsOrSessionId?: string | { rollbackOnFailure?: boolean },
  ): Promise<AuthResponse> {
    const rollbackOnFailure =
      typeof optionsOrSessionId === 'object'
        ? optionsOrSessionId.rollbackOnFailure === true
        : false;
    let sessionId: string | undefined;

    try {
      sessionId =
        typeof optionsOrSessionId === 'string'
          ? optionsOrSessionId
          : await this.createSession(user.id);

      const tokens = await this.signTokens(user, sessionId);
      await Promise.all([
        this.persistRefreshToken(sessionId, tokens.refreshToken),
        this.persistRedisSession(user.id, sessionId),
      ]);

      return { ...tokens, user: this.sanitizeUser(user) };
    } catch (error) {
      if (rollbackOnFailure) {
        await this.rollbackRegistration(user.id, sessionId);
      }
      throw error;
    }
  }

  private sanitizeUser(user: User): SafeUser {
    const safeUser = { ...user } as SafeUser & Partial<User>;
    delete safeUser.password_hash;
    delete safeUser.deleted_at;
    delete safeUser.auth_metadata;
    delete safeUser.roles;
    delete safeUser.sessions;
    return safeUser;
  }

  private async signTokens(user: User, sessionId?: string): Promise<AuthTokens> {
    const payload: JwtPayload = {
      userId: user.id,
      sub: user.id,
      email: user.email,
      sessionId: sessionId || '',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: env.JWT_ACCESS_SECRET,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN as StringValue,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async persistRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.userSessionAction.updateById(sessionId, {
      refresh_token: hash,
    });
  }

  private async persistRedisSession(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const redisKey = `${REDIS_SESSION_KEY_PREFIX}:${userId}:${sessionId}`;
    const redisValue = JSON.stringify({ userId, sessionId });
    await this.redisService.setStrict(
      redisKey,
      redisValue,
      REDIS_SESSION_TTL_SECONDS,
    );
  }

  private async rollbackRegistration(
    userId: string,
    sessionId?: string,
  ): Promise<void> {
    if (sessionId) {
      await this.userSessionAction.deleteById(sessionId);
    }

    await this.usersService.remove(userId);
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
      throw new HttpException(
        SYS_MSG.AUTH_ACCOUNT_LOCKED,
        HttpStatus.LOCKED,
      );
    }
  }

  private async recordFailedLogin(
    userId: string,
    metadata: AuthMetadata,
  ): Promise<void> {
    const nextAttempts = metadata.failed_attempts + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS)
      : metadata.locked_until;

    await this.authMetadataAction.updateByUserId(userId, {
      failed_attempts: nextAttempts,
      locked_until: lockedUntil,
    });

    if (shouldLock) {
      throw new HttpException(
        SYS_MSG.AUTH_TOO_MANY_FAILED_ATTEMPTS,
        HttpStatus.LOCKED,
      );
    }
  }

  private async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.authMetadataAction.updateByUserId(userId, {
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date(),
    });
  }

  private async createSession(userId: string): Promise<string> {
    const refreshTokenPlaceholder = `temp-${Date.now()}`;
    const refreshTokenHash = await bcrypt.hash(refreshTokenPlaceholder, 10);

    const expiresAt = new Date();
    const refreshExpiresInSeconds = parseInt(
      env.JWT_REFRESH_EXPIRES_IN.replace(/\D/g, ''),
      10
    );
    const refreshExpiresInMs = env.JWT_REFRESH_EXPIRES_IN.includes('d')
      ? refreshExpiresInSeconds * 24 * 60 * 60 * 1000
      : env.JWT_REFRESH_EXPIRES_IN.includes('h')
        ? refreshExpiresInSeconds * 60 * 60 * 1000
        : env.JWT_REFRESH_EXPIRES_IN.includes('m')
          ? refreshExpiresInSeconds * 60 * 1000
          : refreshExpiresInSeconds * 1000;

    expiresAt.setTime(expiresAt.getTime() + refreshExpiresInMs);

    const savedSession = await this.userSessionAction.createSession({
      user_id: userId,
      refresh_token: refreshTokenHash,
      expires_at: expiresAt,
      is_revoked: false,
    });
    return savedSession.id;
  }
}
