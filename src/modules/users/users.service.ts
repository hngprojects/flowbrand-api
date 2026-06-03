import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { QueryFailedError, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APP_EVENTS } from '../../common/constants/app-events';
import { ProfileUpdatedEvent, AccountDeletedEvent } from '../../common/events';
import { emitSafely } from '../../common/events/emit-safely';
import { UserModelAction } from './actions/user.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStateService } from './user-state.service';
import type { UserStateResponse as UserDashboardStateResponse } from './interfaces/user-state.interface';
import * as SYS_MSG from '../../constants/system.messages';
import { RedisService } from '../redis/redis.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthMetadataModelAction } from '../auth/actions/auth-metadata.action';
import { IUserProfile } from './interfaces/user-profile.interface';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ALLOWED_SSA_COUNTRIES } from './enums/allowed-ssa-countries.enum';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_SIGNED_URL_EXPIRY_SECONDS,
  AVATAR_STORAGE_PREFIX,
  buildPublicAvatarUrl,
  MAX_AVATAR_UPLOAD_BYTES,
} from './constants/avatar.constants';
import { AvatarFileExtension, AvatarMimeType } from './enums/avatar-mime-type.enum';
import type { IUserAvatarResponse } from './interfaces/user-avatar.interface';
import { UPLOAD_OBJECT_STORAGE, type ObjectStorage } from '../upload/upload.types';
import { resolveUploadStoragePublicBaseUrl } from '../upload/utils/upload-storage-public-url';
import { ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { redisKeys } from '../../constants/redis-keys';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { UpdateNotificationPreferencesDto } from '../notifications/dto/update-notification-preferences.dto';
import { NotificationPreferenceResponse } from '../notifications/interfaces/notification-preference.interface';

const BCRYPT_ROUNDS = 10;
const NO_TRANSACTION = {
  transactionOptions: { useTransaction: false as const },
};
const AVATAR_FILE_EXTENSION_BY_MIME: Record<AvatarMimeType, AvatarFileExtension> = {
  [AvatarMimeType.JPEG]: AvatarFileExtension.JPG,
  [AvatarMimeType.PNG]: AvatarFileExtension.PNG,
  [AvatarMimeType.WEBP]: AvatarFileExtension.WEBP,
};

const detectFileTypeFromBuffer = async (buffer: Buffer) => {
  const { fileTypeFromBuffer } = await import('file-type');
  return fileTypeFromBuffer(buffer);
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly userModelAction: UserModelAction,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly authMetaModelAction: AuthMetadataModelAction,
    private readonly redisService: RedisService,
    private readonly userStateService: UserStateService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notificationsService: NotificationsService,
    private readonly pinoLogger: PinoLoggerService,
    @InjectQueue(ACCOUNT_DELETION_QUEUE)
    private readonly accountDeletionQueue: Queue,
    private readonly dataSource: DataSource,
    @Inject(UPLOAD_OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorage,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userModelAction.findByEmail(dto.email);
    if (existing) {
      if (existing.is_active === false) {
        throw new ConflictException(SYS_MSG.USER_ACCOUNT_LOCKED);
      }
      throw new ConflictException(SYS_MSG.USER_EMAIL_IN_USE);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.userModelAction.create({
        ...NO_TRANSACTION,
        createPayload: {
          email: dto.email,
          termsAccepted: dto.termsAccepted ?? false,
          password_hash: passwordHash,
          full_name: dto.fullName,
          roles: [
            {
              role: dto.role ?? UserRole.USER,
            },
          ],
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException(SYS_MSG.USER_EMAIL_IN_USE);
      }
      throw error;
    }
  }

  async createGoogleAccount(dto: {
    email: string;
    fullName: string;
    providerUserId: string;
    avatarUrl: string | null;
  }): Promise<User> {
    try {
      return await this.userModelAction.create({
        ...NO_TRANSACTION,
        createPayload: {
          email: dto.email,
          full_name: dto.fullName,
          password_hash: null,
          termsAccepted: true,
          is_verified: true,
          auth_provider: 'google',
          provider_user_id: dto.providerUserId,
          avatar_url: dto.avatarUrl,
          roles: [{ role: UserRole.USER }],
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException(SYS_MSG.USER_EMAIL_IN_USE);
      }
      throw error;
    }
  }

  findAll(pagination: PaginationDto) {
    return this.userModelAction.list({
      paginationPayload: { page: pagination.page!, limit: pagination.limit! },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModelAction.get({
      identifierOptions: { id },
    });
    if (!user) throw new NotFoundException(SYS_MSG.USER_NOT_FOUND(id));
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userModelAction.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findById(id);

    const payload: Partial<User> = {};

    if (dto.fullName !== undefined) payload.full_name = dto.fullName;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.termsAccepted !== undefined) payload.termsAccepted = dto.termsAccepted;

    if (dto.password) {
      payload.password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id },
      updatePayload: payload,
    });
    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.USER_UPDATE_FAILED);
    }
    return updated;
  }

  async updateGoogleAccount(
    id: string,
    dto: {
      fullName: string;
      providerUserId: string;
      avatarUrl: string | null;
    },
  ): Promise<User> {
    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id },
      updatePayload: {
        full_name: dto.fullName,
        is_verified: true,
        auth_provider: 'google',
        provider_user_id: dto.providerUserId,
        avatar_url: dto.avatarUrl,
      },
    });

    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.USER_UPDATE_FAILED);
    }
    return updated;
  }

  async markVerified(userId: string): Promise<User> {
    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id: userId },
      updatePayload: { is_verified: true },
    });
    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.USER_UPDATE_FAILED);
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.userModelAction.delete({
      ...NO_TRANSACTION,
      identifierOptions: { id },
    });
    emitSafely(this.eventEmitter, this.logger, APP_EVENTS.ACCOUNT_DELETED, new AccountDeletedEvent(id));
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.userSessionModelAction.findByUserId(userId);

    if (!sessions || sessions.length === 0) {
      this.pinoLogger.debug('No active sessions found to revoke', { userId });
      return;
    }

    const activeSessions = sessions.filter((s) => !s.is_revoked);
    await Promise.all(
      activeSessions.map(async (session) => {
        await this.userSessionModelAction.updateById(session.id, {
          is_revoked: true,
          revoked_at: new Date(),
        });
        await Promise.all([
          this.redisService.del(redisKeys.activeSession(userId, session.id)),
          this.redisService.del(redisKeys.session(userId, session.id)),
        ]);
      }),
    );

    this.logger.debug({
      message: `Revoked ${activeSessions.length} sessions for user`,
      userId,
      sessionCount: activeSessions.length,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findById(userId);

    if (!user.password_hash) {
      throw new UnprocessableEntityException({
        message:
          user.auth_provider === 'google' ? SYS_MSG.PASSWORD_CHANGE_NOT_SUPPORTED : SYS_MSG.PASSWORD_CHANGE_UNAVAILABLE,
      });
    }

    const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.password_hash);

    if (!isOldPasswordValid) {
      throw new UnauthorizedException({ message: SYS_MSG.INCORRECT_OLD_PASSWORD });
    }

    if (dto.newPassword === dto.oldPassword) {
      throw new UnprocessableEntityException({ message: SYS_MSG.PASSWORD_CHANGE_NOT_SUCCESSFUL });
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new UnprocessableEntityException(SYS_MSG.INCORRECT_CONFIRM_PASSWORD);
    }

    const saveNewPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id: userId },
      updatePayload: { password_hash: saveNewPassword },
    });

    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.USER_UPDATE_FAILED);
    }

    const existingMeta = await this.authMetaModelAction.findByUserId(userId);
    if (!existingMeta) {
      await this.authMetaModelAction.createForUser({
        user_id: userId,
        password_changed_at: new Date(),
      });
    } else {
      await this.authMetaModelAction.updateByUserId(userId, {
        password_changed_at: new Date(),
      });
    }

    await this.revokeAllUserSessions(userId);

    this.logger.log({
      message: SYS_MSG.PASSWORD_CHANGE_SUCCESSFUL,
      userId,
    });
  }

  async getUserState(userId: string): Promise<UserDashboardStateResponse> {
    return this.userStateService.getUserState(userId);
  }

  private async toProfileResponse(user: User): Promise<IUserProfile> {
    const avatarUrl = this.isStoredAvatarPath(user.avatar_url)
      ? await this.resolveAvatarUrl(user.avatar_url)
      : user.avatar_url;

    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      country: user.country,
      avatarUrl,
      authProvider: user.auth_provider,
      isVerified: user.is_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  private toNotificationPreferenceResponse(preference: NotificationPreference): NotificationPreferenceResponse {
    return {
      id: preference.id,
      userId: preference.user_id,
      emailFunnelReady: preference.email_funnel_ready,
      emailStageUnlocked: preference.email_stage_unlocked,
      emailStageCompleted: preference.email_stage_completed,
      emailWeeklyDigest: preference.email_weekly_digest,
      inappTaskCompleted: preference.inapp_task_completed,
      inappStageUnlocked: preference.inapp_stage_unlocked,
      createdAt: preference.created_at,
      updatedAt: preference.updated_at,
    };
  }

  async getProfile(userId: string): Promise<IUserProfile> {
    const user = await this.findById(userId);
    return await this.toProfileResponse(user);
  }

  private isStoredAvatarPath(avatarUrl: string | null): avatarUrl is string {
    return typeof avatarUrl === 'string' && avatarUrl.startsWith(`${AVATAR_STORAGE_PREFIX}/`);
  }

  private buildAvatarStoragePath(userId: string, fileExtension: AvatarFileExtension): string {
    return path.posix.join(AVATAR_STORAGE_PREFIX, userId, `${randomUUID()}.${fileExtension}`);
  }

  private async resolveAvatarUrl(storagePath: string): Promise<string> {
    if (resolveUploadStoragePublicBaseUrl()) {
      return buildPublicAvatarUrl(storagePath);
    }

    try {
      return await this.objectStorage.createPresignedGetObjectUrl(storagePath, AVATAR_SIGNED_URL_EXPIRY_SECONDS);
    } catch (error) {
      this.logger.error(
        `Failed to create avatar signed URL for ${storagePath}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(SYS_MSG.PROFILE_AVATAR_UPLOAD_FAILED);
    }
  }

  async uploadAvatar(userId: string, file: Express.Multer.File | undefined): Promise<IUserAvatarResponse> {
    if (!file?.buffer) {
      throw new UnprocessableEntityException(SYS_MSG.PROFILE_AVATAR_FILE_REQUIRED);
    }

    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      throw new UnprocessableEntityException(SYS_MSG.PROFILE_AVATAR_UPLOAD_TOO_LARGE);
    }

    const detectedFileType = await detectFileTypeFromBuffer(file.buffer);
    if (!detectedFileType) {
      throw new UnprocessableEntityException(SYS_MSG.PROFILE_AVATAR_UPLOAD_INVALID_TYPE);
    }

    const detectedMimeType = detectedFileType.mime as AvatarMimeType;
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(detectedMimeType)) {
      throw new UnprocessableEntityException(SYS_MSG.PROFILE_AVATAR_UPLOAD_INVALID_TYPE);
    }

    const avatarFileExtension = AVATAR_FILE_EXTENSION_BY_MIME[detectedMimeType];
    const storagePath = this.buildAvatarStoragePath(userId, avatarFileExtension);

    const user = await this.findById(userId);
    const previousAvatarPath = this.isStoredAvatarPath(user.avatar_url) ? user.avatar_url : null;
    let objectWritten = false;

    try {
      await this.objectStorage.putObject({
        storagePath,
        body: file.buffer,
        contentType: detectedMimeType,
        contentLength: file.size,
      });
      objectWritten = true;

      const avatarUrl = await this.resolveAvatarUrl(storagePath);

      const updatedUser = await this.userModelAction.updateAvatarUrl(userId, storagePath);
      if (!updatedUser) {
        throw new InternalServerErrorException(SYS_MSG.PROFILE_AVATAR_UPLOAD_FAILED);
      }

      if (previousAvatarPath) {
        try {
          await this.objectStorage.deleteObject(previousAvatarPath);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to remove previous avatar ${previousAvatarPath}`,
            cleanupError instanceof Error ? cleanupError.stack : undefined,
          );
        }
      }

      return { avatarUrl };
    } catch (error) {
      if (objectWritten) {
        try {
          await this.objectStorage.deleteObject(storagePath);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up uploaded avatar ${storagePath}`,
            cleanupError instanceof Error ? cleanupError.stack : undefined,
          );
        }
      }

      if (error instanceof UnprocessableEntityException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(SYS_MSG.PROFILE_AVATAR_UPLOAD_FAILED);
    }
  }

  async deleteAvatar(userId: string): Promise<IUserAvatarResponse> {
    const user = await this.findById(userId);
    const currentAvatarPath = this.isStoredAvatarPath(user.avatar_url) ? user.avatar_url : null;

    if (!currentAvatarPath && user.avatar_url === null) {
      return { avatarUrl: null };
    }

    if (currentAvatarPath) {
      await this.objectStorage.deleteObject(currentAvatarPath);
    }

    const updatedUser = await this.userModelAction.updateAvatarUrl(userId, null);
    if (!updatedUser) {
      throw new InternalServerErrorException(SYS_MSG.PROFILE_AVATAR_DELETE_FAILED);
    }

    return { avatarUrl: null };
  }

  /** Returns the authenticated user's notification preferences, creating defaults when needed. */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferenceResponse> {
    await this.findById(userId);
    const preference = await this.notificationsService.getNotificationPreferences(userId);
    return this.toNotificationPreferenceResponse(preference);
  }

  /** Partially updates the authenticated user's notification preferences. */
  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferenceResponse> {
    await this.findById(userId);
    const preference = await this.notificationsService.updateNotificationPreferences(userId, dto);
    return this.toNotificationPreferenceResponse(preference);
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto & { email?: unknown }): Promise<IUserProfile> {
    if ('email' in dto && dto.email !== undefined) {
      throw new UnprocessableEntityException(SYS_MSG.PROFILE_EMAIL_CHANGE_FORBIDDEN);
    }

    const user = await this.findById(userId);

    let normalisedCountry: string | undefined;
    if (dto.country !== undefined) {
      normalisedCountry = ALLOWED_SSA_COUNTRIES.find((c) => c.toLowerCase() === dto.country!.toLowerCase());
      // If IsIn() passed in the DTO, a match is guaranteed — this is a safety net
      if (!normalisedCountry) {
        throw new UnprocessableEntityException(SYS_MSG.VALIDATION_FAILED);
      }
    }

    const changedFields: Array<'full_name' | 'country'> = [];
    const updatePayload: Partial<User> = {};

    if (dto.fullName !== undefined && dto.fullName !== user.full_name) {
      updatePayload.full_name = dto.fullName;
      changedFields.push('full_name');
    }

    if (normalisedCountry !== undefined && normalisedCountry !== user.country) {
      updatePayload.country = normalisedCountry;
      changedFields.push('country');
    }

    if (Object.keys(updatePayload).length === 0) {
      return await this.toProfileResponse(user);
    }

    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id: userId },
      updatePayload,
    });

    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.PROFILE_UPDATE_FAILED);
    }

    emitSafely(
      this.eventEmitter,
      this.logger,
      APP_EVENTS.PROFILE_UPDATED,
      new ProfileUpdatedEvent(userId, changedFields),
    );

    return await this.toProfileResponse(updated);
  }

  async deleteAccount(userId: string, confirmation: string): Promise<void> {
    if (confirmation !== 'DELETE') {
      throw new UnprocessableEntityException(SYS_MSG.ACCOUNT_DELETION_CONFIRMATION_REQUIRED);
    }

    const user = await this.userModelAction.findById(userId);
    if (!user) {
      throw new NotFoundException(SYS_MSG.USER_NOT_FOUND(userId));
    }

    if (user.deleted_at !== null) {
      throw new UnauthorizedException(SYS_MSG.ACCOUNT_ALREADY_DELETED);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    let committed = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const now = new Date();
      const thirtyDaysLater = 30 * 24 * 60 * 60 * 1000;

      // Single UPDATE with conditional fields
      const updatePayload: Partial<User> = {
        deleted_at: now,
        is_active: false,
      };

      if (user.auth_provider === 'google') {
        updatePayload.provider_user_id = null;
      }

      await queryRunner.manager.update(User, userId, updatePayload);

      const revokedSessionIds = await this.userSessionModelAction.revokeAllUserSessionsInDb(
        userId,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
      committed = true;

      if (revokedSessionIds.length > 0) {
        await this.redisService.delByPattern(`sess:${userId}:*`);
      }

      this.pinoLogger.info('Account deleted', { userId });

      await this.accountDeletionQueue.add('hard-delete', { userId, email: user.email }, { delay: thirtyDaysLater });
    } catch (error) {
      if (!committed) {
        await queryRunner.rollbackTransaction();
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.pinoLogger.error('Account deletion failed', { userId, error: errorMessage, committed });

      if (committed) {
        this.pinoLogger.warn('Account deleted but queue failed', { userId, error: errorMessage });
        return;
      }

      throw new InternalServerErrorException(SYS_MSG.ACCOUNT_DELETION_FAILED);
    } finally {
      await queryRunner.release();
    }
  }
}
