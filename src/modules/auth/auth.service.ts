import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import * as SYS_MSG from '../../constants/system.messages';
import { env } from '../../config/env';
import { User } from '../users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const REGISTRATION_REDIS_TTL_SECONDS = 15 * 60;
const REGISTRATION_REDIS_KEY_PREFIX = 'sess';

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
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (!dto.termsAccepted) {
      throw new BadRequestException(
        'You must accept the terms and conditions to register',
      );
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      termsAccepted: true,
    });
    return this.issueTokens(user, { persistRedisSession: true });
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user?.password_hash) {
      throw new UnauthorizedException(SYS_MSG.AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(SYS_MSG.AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    return this.issueTokens(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        {
          secret: env.JWT_REFRESH_SECRET,
        },
      );
    } catch {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_MESSAGES.INVALID_REFRESH_TOKEN,
      );
    }

    const session = await this.userSessionRepository.findOne({
      where: { id: payload.sessionId },
    });

    if (!session || session.isRevoked) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_MESSAGES.INVALID_REFRESH_TOKEN,
      );
    }

    const tokenMatches = await bcrypt.compare(
      dto.refreshToken,
      session.refreshToken,
    );

    if (!tokenMatches) {
      throw new UnauthorizedException(
        SYS_MSG.AUTH_MESSAGES.INVALID_REFRESH_TOKEN,
      );
    }

    const user = await this.usersService.findOne(payload.sub);
    return this.issueTokens(user, session.id);
  }

  async logout(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await this.userSessionRepository.update(
      { id: sessionId },
      {
        isRevoked: true,
        revokedAt: new Date(),
      },
    );
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  private async issueTokens(
    user: User,
    optionsOrSessionId?: string | { persistRedisSession?: boolean },
  ): Promise<AuthResponse> {
    const shouldPersistRedisSession =
      typeof optionsOrSessionId === 'object'
        ? optionsOrSessionId.persistRedisSession === true
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
        shouldPersistRedisSession
          ? this.persistRedisRegistrationSession(user.id, sessionId)
          : Promise.resolve(),
      ]);

      return { ...tokens, user: this.sanitizeUser(user) };
    } catch (error) {
      if (shouldPersistRedisSession) {
        await this.rollbackRegistration(user.id, sessionId);
      }
      throw error;
    }
  }

  private sanitizeUser(user: User): SafeUser {
    const safeUser = { ...user } as SafeUser & Partial<User>;
    delete safeUser.password_hash;
    delete safeUser.deletedAt;
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
    await this.userSessionRepository.update({ id: sessionId }, { refreshToken: hash });
  }

  private async persistRedisRegistrationSession(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const redisKey = `${REGISTRATION_REDIS_KEY_PREFIX}:${userId}:${sessionId}`;
    const redisValue = JSON.stringify({ userId, sessionId });
    await this.redisService.setStrict(
      redisKey,
      redisValue,
      REGISTRATION_REDIS_TTL_SECONDS,
    );
  }

  private async rollbackRegistration(
    userId: string,
    sessionId?: string,
  ): Promise<void> {
    if (sessionId) {
      await this.userSessionRepository.delete({ id: sessionId });
    }

    await this.usersService.remove(userId);
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

    const session = this.userSessionRepository.create({
      userId,
      refreshToken: refreshTokenHash,
      expiresAt,
      isRevoked: false,
    });

    const savedSession = await this.userSessionRepository.save(session);
    return savedSession.id;
  }
}
