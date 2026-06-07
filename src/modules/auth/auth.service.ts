import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UserSessionModelAction } from '../users/actions/user-session.action';
import { AuthMetadataModelAction } from './actions/auth-metadata.action';
import { OtpTokenModelAction } from './actions/otp-token.action';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import * as SYS_MSG from '../../constants/system.messages';
import { env } from '../../config/env';
import { User } from '../users/entities/user.entity';
import type { UserSession } from '../users/entities/user-session.entity';
import type { AuthMetadata } from './entities/auth-metadata.entity';
import type { OtpToken, OtpTokenType } from './entities/otp-token.entity';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { GoogleOAuthProfile, OAuthLoginResponse } from './interface/google-oauth.interface';
import { maskEmail } from '../../utils/pii.utils';
import { JwtPayload } from './strategies/jwt.strategy';
import { redisKeys } from '../../constants/redis-keys';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitSafely } from '../../common/events/emit-safely';
import { UserSignedUpEvent } from '../../common/events';
import { APP_EVENTS } from '../../common/constants/app-events';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const REDIS_SESSION_TTL_SECONDS = 15 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 60 * 60 * 1000;

type SafeUser = Omit<User, 'password_hash' | 'deletedAt' | 'deleted_at' | 'auth_metadata' | 'sessions' | 'roles'>;

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
    private readonly otpTokenModelAction: OtpTokenModelAction,
    private readonly emailService: EmailService,
    @Optional() private readonly logger = new Logger(AuthService.name),
    private readonly eventEmitter: EventEmitter2,
  ) { }

  // Local minimal interface to avoid unsafe-call lint issues from third-party model action types
  private get userSessionAction(): {
    findById(id: string): Promise<UserSession | null>;
    findByUserId(userId: string): Promise<UserSession[]>;
    updateById(id: string, payload: Partial<UserSession>): Promise<UserSession | null>;
    deleteById(id: string): Promise<void>;
    createSession(payload: Partial<UserSession>): Promise<UserSession>;
  } {
    return this.userSessionModelAction;
  }

  private get authMetadataAction(): {
    findByUserId(userId: string): Promise<AuthMetadata | null>;
    updateByUserId(userId: string, payload: Partial<AuthMetadata>): Promise<AuthMetadata | null>;
    createForUser(payload: Partial<AuthMetadata>): Promise<AuthMetadata>;
    incrementFailedAttempts(userId: string): Promise<number>;
  } {
    return this.authMetadataModelAction;
  }

  private get otpTokenAction(): {
    replaceToken(payload: {
      user_id: string;
      type: OtpTokenType;
      token_hash: string;
      expires_at: Date;
    }): Promise<OtpToken>;
    delete(options: {
      identifierOptions: Partial<OtpToken>;
      transactionOptions: { useTransaction: false };
    }): Promise<unknown>;
  } {
    return this.otpTokenModelAction;
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    if (!dto.termsAccepted) {
      throw new BadRequestException(SYS_MSG.AUTH_TERMS_REQUIRED);
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      businessName: dto.businessName,
      termsAccepted: true,
    });
    await this.sendOtp(user.email);

    emitSafely(this.eventEmitter, this.logger, APP_EVENTS.USER_SIGNED_UP, new UserSignedUpEvent(user.id));

    return { message: SYS_MSG.REGISTRATION_SUCCESSFUL_VERIFY_EMAIL };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user?.password_hash) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_CREDENTIALS);
    }

    if (!user?.is_verified) {
      throw new ForbiddenException(SYS_MSG.AUTH_EMAIL_UNVERIFIED);
    }

    const metadata = await this.ensureAuthMetadata(user.id);
    this.throwIfLocked(metadata);

    const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordMatches) {
      await this.recordFailedLogin(user.id);
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_CREDENTIALS);
    }

    await this.recordSuccessfulLogin(user.id);
    return this.issueTokens(user);
  }

  async initiateOAuthExchange(profile: GoogleOAuthProfile): Promise<string> {
    const oauthResult = await this.handleOAuthLogin(profile);

    const exchangeCode = crypto.randomBytes(32).toString('hex');

    const redisKey = `oauth:exchange:${exchangeCode}`;

    // Save to Redis strictly for 60 seconds
    await this.redisService.setStrict(redisKey, JSON.stringify(oauthResult), 60);

    return exchangeCode;
  }

  async exchangeCode(code: string): Promise<OAuthLoginResponse> {
    const redisKey = `oauth:exchange:${code}`;
    const rawData = await this.redisService.getdel(redisKey);

    if (!rawData) {
      throw new BadRequestException(SYS_MSG.GOOGLE_EXCHANGE_CODE_INVALID);
    }

    try {
      return JSON.parse(rawData) as OAuthLoginResponse;
    } catch {
      throw new BadRequestException(SYS_MSG.GOOGLE_EXCHANGE_CODE_INVALID);
    }
  }

  async handleOAuthLogin(profile: GoogleOAuthProfile): Promise<OAuthLoginResponse> {
    const email = profile.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);

    let user: User;

    if (existingUser) {
      if (
        existingUser.auth_provider === 'google' &&
        existingUser.provider_user_id &&
        existingUser.provider_user_id !== profile.providerId
      ) {
        throw new ConflictException(SYS_MSG.GOOGLE_ACCOUNT_LINK_CONFLICT);
      }

      user = await this.usersService.updateGoogleAccount(existingUser.id, {
        fullName: profile.fullName || existingUser.full_name,
        providerUserId: profile.providerId,
        avatarUrl: profile.avatarUrl,
      });
    } else {
      try {
        user = await this.usersService.createGoogleAccount({
          email,
          fullName: profile.fullName || email,
          providerUserId: profile.providerId,
          avatarUrl: profile.avatarUrl,
        });
      } catch (error) {
        if (this.isUniqueEmailConflict(error)) {
          const concurrentUser = await this.usersService.findByEmail(email);
          if (!concurrentUser) {
            throw error;
          }

          if (
            concurrentUser.auth_provider === 'google' &&
            concurrentUser.provider_user_id &&
            concurrentUser.provider_user_id !== profile.providerId
          ) {
            throw new ConflictException(SYS_MSG.GOOGLE_ACCOUNT_LINK_CONFLICT);
          }

          user = await this.usersService.updateGoogleAccount(concurrentUser.id, {
            fullName: profile.fullName || concurrentUser.full_name,
            providerUserId: profile.providerId,
            avatarUrl: profile.avatarUrl,
          });
        } else {
          throw error;
        }
      }
    }

    const tokens = await this.issueTokens(user);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      data: {
        user: {
          id: tokens.user.id,
          fullName: tokens.user.full_name,
          email: tokens.user.email,
          avatarUrl: tokens.user.avatar_url,
        },
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const { exceeded } = await this.redisService.rateLimit(redisKeys.refreshRateLimit(payload.userId), 10, 3600);
    if (exceeded) {
      throw new HttpException(SYS_MSG.AUTH_REFRESH_RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
    }

    const session = await this.userSessionAction.findById(payload.sessionId);

    if (!session || session.is_revoked) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const tokenMatches = await bcrypt.compare(refreshToken, session.refresh_token);

    if (!tokenMatches) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const user = await this.usersService.findById(payload.sub);
    return this.issueTokens(user, session.id);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    if (!sessionId) return;

    const redisKey = redisKeys.activeSession(userId, sessionId);
    const legacyRedisKey = redisKeys.session(userId, sessionId);
    await Promise.all([
      this.userSessionAction.updateById(sessionId, {
        is_revoked: true,
        revoked_at: new Date(),
      }),
      this.redisService.del(redisKey),
      this.redisService.del(legacyRedisKey),
    ]);
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  async sendOtp(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return { message: SYS_MSG.OTP_SENT_SUCCESSFULLY };
    }

    if (user.is_verified) {
      return { message: SYS_MSG.OTP_SENT_SUCCESSFULLY };
    }

    const rateKey = `otp:rate:${user.id}`;
    const newCount = await this.redisService.incr(rateKey);
    if (newCount !== null) {
      if (newCount === 1) {
        await this.redisService.expire(rateKey, 900);
      }
      if (newCount > 5) {
        throw new HttpException(SYS_MSG.OTP_RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    await this.generateAndSendOtp(user);

    return { message: SYS_MSG.OTP_SENT_SUCCESSFULLY };
  }

  async verifyOtp(email: string, otpCode: string): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException(SYS_MSG.OTP_INVALID);
    }

    if (user.is_verified) {
      throw new ConflictException(SYS_MSG.ACCOUNT_ALREADY_VERIFIED);
    }

    const attemptsKey = `otp:verify:${user.id}`;
    const { exceeded } = await this.redisService.rateLimit(attemptsKey, 5, 300);
    if (exceeded) {
      throw new HttpException(SYS_MSG.OTP_VERIFY_ATTEMPTS_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }

    const lockKey = `otp:verify:lock:${user.id}`;
    const lockToken = crypto.randomUUID();
    const lockAcquired = await this.redisService.setNx(lockKey, lockToken, 30);
    if (!lockAcquired) {
      throw new BadRequestException(SYS_MSG.OTP_INVALID);
    }

    try {
      const token = await this.otpTokenModelAction.findByUserAndType(user.id, 'email_verification');

      if (!token) {
        throw new BadRequestException(SYS_MSG.OTP_INVALID);
      }

      if (token.expires_at < new Date()) {
        await this.otpTokenAction.delete({
          identifierOptions: { user_id: user.id, type: 'email_verification' as const },
          transactionOptions: { useTransaction: false },
        });
        throw new BadRequestException(SYS_MSG.OTP_EXPIRED);
      }

      const codeMatches = await bcrypt.compare(otpCode, token.token_hash);
      if (!codeMatches) {
        throw new BadRequestException(SYS_MSG.OTP_INVALID);
      }

      await Promise.all([
        this.redisService.del(attemptsKey),
        this.otpTokenAction.delete({
          identifierOptions: { user_id: user.id, type: 'email_verification' as const },
          transactionOptions: { useTransaction: false },
        }),
      ]);

      const verifiedUser = await this.usersService.markVerified(user.id);
      return this.issueTokens(verifiedUser);
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  async resendOtp(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return { message: SYS_MSG.OTP_SENT_SUCCESSFULLY };
    }

    if (user.is_verified) {
      return { message: SYS_MSG.ACCOUNT_ALREADY_VERIFIED };
    }

    const hourlyKey = `otp:resend:${user.id}`;
    const hourlyCount = await this.redisService.incr(hourlyKey);
    if (hourlyCount !== null) {
      if (hourlyCount === 1) {
        await this.redisService.expire(hourlyKey, 3600);
      }
      if (hourlyCount > 10) {
        throw new HttpException(
          { message: SYS_MSG.OTP_RESEND_HOURLY_LIMIT, retryAfter: 3600 },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const cooldownKey = `otp:cooldown:${user.id}`;
    const cooldownRaw = await this.redisService.get(cooldownKey);
    if (cooldownRaw) {
      const retryAfter = Math.ceil((parseInt(cooldownRaw, 10) - Date.now()) / 1000);
      throw new HttpException({ message: SYS_MSG.OTP_RESEND_RATE_LIMITED, retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.generateAndSendOtp(user);
    await this.redisService.set(cooldownKey, String(Date.now() + 30_000), 30);

    return { message: SYS_MSG.OTP_RESENT_SUCCESSFULLY };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      this.logger.debug({ message: 'Password reset requested for non-existent email', email: maskEmail(email) });
      return { message: SYS_MSG.PASSWORD_RESET_OTP_SENT };
    }

    if (!user.is_verified) {
      this.logger.debug({ message: 'Password reset requested for unverified account', userId: user.id });
      return { message: SYS_MSG.PASSWORD_RESET_OTP_SENT };
    }

    const rateKey = `password-reset:rate:${user.id}`;
    const newCount = await this.redisService.incr(rateKey);
    if (newCount !== null) {
      if (newCount === 1) {
        await this.redisService.expire(rateKey, 900);
      }
      if (newCount > 3) {
        this.logger.warn({
          message: 'Password reset rate limit exceeded',
          userId: user.id,
          attempts: newCount,
        });
        throw new HttpException(SYS_MSG.PASSWORD_RESET_RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    await this.generateAndSendPasswordResetOtp(user);

    return { message: SYS_MSG.PASSWORD_RESET_OTP_SENT };
  }

  private async generateAndSendPasswordResetOtp(user: User): Promise<void> {
    const otpCode = crypto.randomInt(100000, 1000000);
    const token_hash = await bcrypt.hash(String(otpCode), 10);

    await this.otpTokenAction.replaceToken({
      user_id: user.id,
      type: 'password_reset',
      token_hash,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    });

    await this.emailService.sendPasswordReset(
      user.email,
      {
        fullName: user.full_name,
        otpCode: String(otpCode),
        expiryMins: 15,
      },
      user.id,
    );

    this.logger.log({
      message: 'Password reset OTP generated and queued',
      userId: user.id,
      email: maskEmail(user.email),
      expiresIn: '15 minutes',
    });
  }

  /**
   * Validates a password-reset OTP and returns a single-use `reset_token` JWT
   * (15 min). The token must be passed to `resetPassword` to complete the flow.
   */
  async verifyResetOtp(email: string, otpCode: string): Promise<{ reset_token: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
    }

    const attemptsKey = `password-reset:verify:${user.id}`;
    const { exceeded } = await this.redisService.rateLimit(attemptsKey, 5, 300);
    if (exceeded) {
      this.logger.warn({ message: 'Password reset verify attempts exceeded', userId: user.id });
      throw new HttpException(SYS_MSG.PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }

    const lockKey = `password-reset:verify:lock:${user.id}`;
    const lockToken = crypto.randomUUID();
    const lockAcquired = await this.redisService.setNx(lockKey, lockToken, 30);
    if (!lockAcquired) {
      throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
    }

    try {
      const token = await this.otpTokenModelAction.findByUserAndType(user.id, 'password_reset');

      if (!token) {
        throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
      }

      if (token.expires_at < new Date()) {
        await this.otpTokenAction.delete({
          identifierOptions: { user_id: user.id, type: 'password_reset' },
          transactionOptions: { useTransaction: false },
        });
        this.logger.debug({ message: 'Expired password reset OTP used', userId: user.id });
        throw new BadRequestException(SYS_MSG.PASSWORD_RESET_EXPIRED);
      }

      const codeMatches = await bcrypt.compare(otpCode, token.token_hash);
      if (!codeMatches) {
        throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_OTP);
      }

      await this.otpTokenAction.delete({
        identifierOptions: { user_id: user.id, type: 'password_reset' },
        transactionOptions: { useTransaction: false },
      });

      await this.redisService.del(attemptsKey);

      const jti = crypto.randomUUID();
      const reset_token = await this.jwtService.signAsync(
        { sub: user.id, userId: user.id, type: 'password_reset', jti },
        { secret: env.JWT_ACCESS_SECRET, expiresIn: '15m' },
      );
      // 900 s matches the 15 m token expiry — key is atomically consumed in resetPassword.
      await this.redisService.set(redisKeys.passwordResetJti(user.id), jti, 900);

      this.logger.log({ message: 'Password reset OTP verified', userId: user.id });

      return { reset_token };
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Validates a single-use `reset_token` issued by `verifyResetOtp` and sets
   * the user's new password. Auto-logs the user in on success.
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<AuthResponse> {
    let payload: { sub: string; userId: string; type: string; jti?: string };

    try {
      payload = await this.jwtService.verifyAsync(resetToken, { secret: env.JWT_ACCESS_SECRET });
    } catch {
      throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_TOKEN);
    }

    if (payload.type !== 'password_reset') {
      throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_TOKEN);
    }

    // Atomically consume the JTI — rejects replays and tokens not issued via verifyResetOtp.
    const storedJti = await this.redisService.getdel(redisKeys.passwordResetJti(payload.userId));
    if (!storedJti || storedJti !== payload.jti) {
      throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_TOKEN);
    }

    let user: User;
    try {
      user = await this.usersService.findById(payload.userId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new BadRequestException(SYS_MSG.PASSWORD_RESET_INVALID_TOKEN);
      }
      throw err;
    }

    await this.usersService.update(user.id, { password: newPassword });
    await this.authMetadataModelAction.updateByUserId(user.id, {
      password_changed_at: new Date(),
    });
    await this.revokeAllUserSessions(user.id);
    await this.redisService.del(redisKeys.passwordResetRate(user.id));

    const authResponse = await this.issueTokens(user);

    this.logger.log({ message: 'Password reset successful with auto-login', userId: user.id, email: maskEmail(user.email) });

    return authResponse;
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.userSessionAction.findByUserId(userId);

    if (!sessions || sessions.length === 0) {
      this.logger.debug({
        message: 'No active sessions found to revoke',
        userId,
      });
      return;
    }

    for (const session of sessions) {
      if (!session.is_revoked) {
        await this.userSessionAction.updateById(session.id, {
          is_revoked: true,
          revoked_at: new Date(),
        });

        await Promise.all([
          this.redisService.del(redisKeys.activeSession(userId, session.id)),
          this.redisService.del(redisKeys.session(userId, session.id)),
        ]);
      }
    }

    this.logger.debug({
      message: `Revoked ${sessions.length} sessions for user`,
      userId,
      sessionCount: sessions.length,
    });
  }

  private async generateAndSendOtp(user: User): Promise<void> {
    await this.redisService.del(`otp:verify:${user.id}`);
    const otpCode = crypto.randomInt(100000, 1000000);
    const token_hash = await bcrypt.hash(String(otpCode), 10);
    await this.otpTokenAction.replaceToken({
      user_id: user.id,
      type: 'email_verification',
      token_hash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    await this.emailService.sendOtpVerification(
      user.email,
      { fullName: user.full_name, otpCode: String(otpCode), expiryMins: 5 },
      user.id,
    );
  }

  private async issueTokens(
    user: User,
    optionsOrSessionId?: string | { rollbackOnFailure?: boolean },
  ): Promise<AuthResponse> {
    const rollbackOnFailure =
      typeof optionsOrSessionId === 'object' ? optionsOrSessionId.rollbackOnFailure === true : false;
    let sessionId: string | undefined;

    try {
      sessionId = typeof optionsOrSessionId === 'string' ? optionsOrSessionId : await this.createSession(user.id);

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

  private async persistRefreshToken(sessionId: string, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.userSessionAction.updateById(sessionId, {
      refresh_token: hash,
    });
  }

  private async persistRedisSession(userId: string, sessionId: string): Promise<void> {
    const redisKey = redisKeys.activeSession(userId, sessionId);
    const legacyRedisKey = redisKeys.session(userId, sessionId);
    const redisValue = JSON.stringify({ userId, sessionId });
    await Promise.all([
      this.redisService.setStrict(redisKey, redisValue, REDIS_SESSION_TTL_SECONDS),
      this.redisService.setStrict(legacyRedisKey, redisValue, REDIS_SESSION_TTL_SECONDS),
    ]);
  }

  private async rollbackRegistration(userId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      await this.userSessionAction.deleteById(sessionId);
    }

    await this.usersService.remove(userId);
  }

  private async ensureAuthMetadata(userId: string): Promise<AuthMetadata> {
    const existing = await this.authMetadataAction.findByUserId(userId);
    if (existing) return existing;

    try {
      return await this.authMetadataAction.createForUser({
        user_id: userId,
        failed_attempts: 0,
        locked_until: null,
        last_login_at: null,
      });
    } catch (error) {
      if (this.isUniqueEmailConflict(error)) {
        const concurrent = await this.authMetadataAction.findByUserId(userId);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private throwIfLocked(metadata: AuthMetadata): void {
    if (metadata.locked_until && metadata.locked_until.getTime() > Date.now()) {
      throw new HttpException(SYS_MSG.AUTH_ACCOUNT_LOCKED, HttpStatus.LOCKED);
    }
  }

  private async recordFailedLogin(userId: string): Promise<void> {
    const newCount = await this.authMetadataAction.incrementFailedAttempts(userId);
    const shouldLock = newCount >= MAX_FAILED_LOGIN_ATTEMPTS;

    if (shouldLock) {
      await this.authMetadataAction.updateByUserId(userId, {
        locked_until: new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS),
      });
      throw new HttpException(SYS_MSG.AUTH_TOO_MANY_FAILED_ATTEMPTS, HttpStatus.LOCKED);
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
    const refreshExpiresInSeconds = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace(/\D/g, ''), 10);
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

  private isUniqueEmailConflict(error: unknown): boolean {
    if (error instanceof ConflictException) {
      return true;
    }

    return Boolean(
      error &&
      typeof error === 'object' &&
      'driverError' in error &&
      (error as { driverError?: { code?: string } }).driverError?.code === '23505',
    );
  }
}
