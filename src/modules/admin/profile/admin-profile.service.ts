import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserRole } from '../../users/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { AdminProfileModelAction } from './actions/admin-profile.action';
import { AdminNotificationPreferenceModelAction } from './actions/admin-notification-preference.action';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { UpdateAdminNotificationPreferencesDto } from './dto/update-admin-notification-preferences.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { AdminProfileActionType } from './enums/admin-profile-action-type.enum';
import {
  ADMIN_NOTIFICATION_PREFERENCE_FIELDS,
  AdminNotificationPreferenceUpdatePayload,
  AdminNotificationPreferencesResponse,
} from './interfaces/admin-notification-preference.interface';
import { IAdminProfile } from './interfaces/admin-profile.interface';
import { LogService } from './services/log.service';

const ADMIN_PASSWORD_BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AdminProfileService {
  private readonly logger = new Logger(AdminProfileService.name);

  constructor(
    private readonly adminProfileAction: AdminProfileModelAction,
    private readonly adminNotificationPreferenceAction: AdminNotificationPreferenceModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly logService: LogService,
  ) {}
  
  /** Returns the authenticated admin's profile, resolved with their highest role. */
  async getProfile(adminId: string, fallbackRole?: UserRole): Promise<IAdminProfile> {
    const admin = await this.adminProfileAction.findById(adminId);
    if (!admin) {
      throw new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND);
    }

    return this.toProfileResponse(admin, fallbackRole);
  }

  /** Updates full_name and/or country, skipping the DB write when no fields changed. Rejects email changes with 422. */
  async updateProfile(
    adminId: string,
    dto: UpdateAdminProfileDto,
    fallbackRole?: UserRole,
  ): Promise<IAdminProfile> {
    if (dto.email !== undefined) {
      throw new UnprocessableEntityException(SYS_MSG.ADMIN_PROFILE_EMAIL_CHANGE_FORBIDDEN);
    }

    const admin = await this.adminProfileAction.findById(adminId);
    if (!admin) {
      throw new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND);
    }

    const updatePayload: Partial<User> = {};
    const changedFields: Array<'full_name' | 'country'> = [];

    if (dto.full_name !== undefined && dto.full_name !== admin.full_name) {
      updatePayload.full_name = dto.full_name;
      changedFields.push('full_name');
    }

    if (dto.country !== undefined && dto.country !== admin.country) {
      updatePayload.country = dto.country;
      changedFields.push('country');
    }

    if (Object.keys(updatePayload).length === 0) {
      return this.toProfileResponse(admin, fallbackRole);
    }

    const updated = await this.adminProfileAction.updateProfile(adminId, updatePayload);
    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_UPDATE_FAILED);
    }

    await this.logService.logAction({
      admin_id: adminId,
      action_type: AdminProfileActionType.PROFILE_UPDATED,
      status: 'success',
      metadata: { updated_fields: changedFields },
    });

    return this.toProfileResponse(updated, fallbackRole);
  }

  /** Verifies old password with bcrypt, hashes the new one, then atomically updates password_hash and revokes all sessions. */
  async changePassword(adminId: string, dto: ChangeAdminPasswordDto): Promise<void> {
    const admin = await this.adminProfileAction.findById(adminId);
    if (!admin) {
      await this.logPasswordChangeFailure(adminId, 'admin_not_found');
      throw new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND);
    }

    if (!admin.password_hash) {
      await this.logPasswordChangeFailure(adminId, 'password_unavailable');
      throw new UnprocessableEntityException(SYS_MSG.PASSWORD_CHANGE_UNAVAILABLE);
    }

    if (dto.new_password !== dto.confirm_password) {
      await this.logPasswordChangeFailure(adminId, 'confirm_password_mismatch');
      throw new UnprocessableEntityException(SYS_MSG.INCORRECT_CONFIRM_PASSWORD);
    }

    if (dto.new_password === dto.old_password) {
      await this.logPasswordChangeFailure(adminId, 'new_password_equals_old_password');
      throw new UnprocessableEntityException(SYS_MSG.ADMIN_NEW_PASSWORD_MUST_DIFFER_FROM_OLD);
    }

    const oldPasswordMatches = await bcrypt.compare(dto.old_password, admin.password_hash);
    if (!oldPasswordMatches) {
      await this.logPasswordChangeFailure(adminId, 'old_password_incorrect');
      throw new UnauthorizedException(SYS_MSG.ADMIN_OLD_PASSWORD_INCORRECT);
    }

    const hashedPassword = await bcrypt.hash(dto.new_password, ADMIN_PASSWORD_BCRYPT_SALT_ROUNDS);
    try {
      await this.adminProfileAction.updatePasswordAndRevokeSessions(adminId, hashedPassword);
    } catch {
      await this.logPasswordChangeFailure(adminId, 'update_failed');
      throw new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_UPDATE_FAILED);
    }
    await this.logService.logAction({
      admin_id: adminId,
      action_type: AdminProfileActionType.PASSWORD_CHANGED,
      status: 'success',
      metadata: { fields_changed: ['password'] },
    });
  }

  /** Returns the authenticated admin's notification preferences, creating defaults when needed. */
  async getNotificationPreferences(adminId: string): Promise<AdminNotificationPreferencesResponse> {
    const existing = await this.adminNotificationPreferenceAction.findByUserId(adminId);
    if (existing) {
      return this.toNotificationPreferenceResponse(existing);
    }

    try {
      const created = await this.adminNotificationPreferenceAction.createDefaultForUser(adminId);
      return this.toNotificationPreferenceResponse(created);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        const createdByConcurrentRequest = await this.adminNotificationPreferenceAction.findByUserId(adminId);
        if (createdByConcurrentRequest) {
          return this.toNotificationPreferenceResponse(createdByConcurrentRequest);
        }
      }

      throw error;
    }
  }

  /** Partially updates admin notification preferences and returns the current row for empty updates. */
  async updateNotificationPreferences(
    adminId: string,
    dto: UpdateAdminNotificationPreferencesDto,
  ): Promise<AdminNotificationPreferencesResponse> {
    const updatePayload = this.toNotificationPreferenceUpdatePayload(dto);

    if (Object.keys(updatePayload).length === 0) {
      return this.getNotificationPreferences(adminId);
    }

    await this.getNotificationPreferences(adminId);
    const updated = await this.adminNotificationPreferenceAction.updateByUserId(adminId, updatePayload);
    if (updated) {
      return this.toNotificationPreferenceResponse(updated);
    }

    throw new ConflictException(SYS_MSG.ADMIN_NOTIFICATION_PREFERENCES_UPDATE_FAILED);
  }

  private async logPasswordChangeFailure(adminId: string, failedStage: string): Promise<void> {
    await this.logService.logAction({
      admin_id: adminId,
      action_type: AdminProfileActionType.PASSWORD_CHANGED,
      status: 'failed',
      metadata: { failed_stage: failedStage },
    });
  }

  private async toProfileResponse(user: User, fallbackRole?: UserRole): Promise<IAdminProfile> {
    const role = await this.userRoleModelAction.resolveHighestRole(user.id).catch((error: unknown) => {
      this.logger.error('admin.profile.role_resolution_failed', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (!role && fallbackRole) {
      this.logger.warn('admin.profile.role_resolution_fallback_used', {
        userId: user.id,
        role: fallbackRole,
      });
    }

    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      country: user.country,
      avatar_url: user.avatar_url,
      role: role ?? fallbackRole ?? null,
      created_at: user.created_at,
    };
  }

  private toNotificationPreferenceResponse(preference: {
    general_notifications: boolean;
    push_email: boolean;
  }): AdminNotificationPreferencesResponse {
    return {
      generalNotifications: preference.general_notifications,
      pushEmail: preference.push_email,
    };
  }

  private toNotificationPreferenceUpdatePayload(
    dto: UpdateAdminNotificationPreferencesDto,
  ): AdminNotificationPreferenceUpdatePayload {
    return ADMIN_NOTIFICATION_PREFERENCE_FIELDS.reduce<AdminNotificationPreferenceUpdatePayload>((payload, field) => {
      if (dto[field] !== undefined) {
        payload[field] = dto[field];
      }

      return payload;
    }, {});
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    return (error as { driverError?: { code?: string } }).driverError?.code === '23505';
  }
}
