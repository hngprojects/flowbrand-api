import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { User } from '../../users/entities/user.entity';
import { AdminProfileModelAction } from './actions/admin-profile.action';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { AdminProfileResponseDto } from './dto/admin-profile-response.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { AdminProfileActionType } from './enums/admin-profile-action-type.enum';
import { IAdminProfile } from './interfaces/admin-profile.interface';
import { LogService } from './services/log.service';

const ADMIN_PASSWORD_BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AdminProfileService {
  constructor(
    private readonly adminProfileAction: AdminProfileModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly logService: LogService,
  ) {}
  
  /** Returns the authenticated admin's profile, resolved with their highest role. */
  async getProfile(adminId: string): Promise<IAdminProfile> {
    const admin = await this.adminProfileAction.findById(adminId);
    if (!admin) {
      throw new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND);
    }

    return this.toProfileResponse(admin);
  }

  /** Updates full_name and/or country, skipping the DB write when no fields changed. Rejects email changes with 422. */
  async updateProfile(adminId: string, dto: UpdateAdminProfileDto): Promise<IAdminProfile> {
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
      return this.toProfileResponse(admin);
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

    return this.toProfileResponse(updated);
  }

  async changePassword(adminId: string, dto: ChangeAdminPasswordDto): Promise<void> {
    const admin = await this.adminProfileAction.findById(adminId);
    if (!admin) {
      throw new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND);
    }

    if (!admin.password_hash) {
      throw new UnprocessableEntityException(SYS_MSG.PASSWORD_CHANGE_UNAVAILABLE);
    }

    const oldPasswordMatches = await bcrypt.compare(dto.old_password, admin.password_hash);
    if (!oldPasswordMatches) {
      throw new UnauthorizedException(SYS_MSG.ADMIN_OLD_PASSWORD_INCORRECT);
    }

    if (dto.new_password === dto.old_password) {
      throw new UnprocessableEntityException(SYS_MSG.ADMIN_NEW_PASSWORD_MUST_DIFFER_FROM_OLD);
    }

    const hashedPassword = await bcrypt.hash(dto.new_password, ADMIN_PASSWORD_BCRYPT_SALT_ROUNDS);
    const updated = await this.adminProfileAction.updatePasswordHash(adminId, hashedPassword);

    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_UPDATE_FAILED);
    }

    await this.adminProfileAction.revokeAllSessions(adminId);
    await this.logService.logAction({
      admin_id: adminId,
      action_type: AdminProfileActionType.PASSWORD_CHANGED,
      status: 'success',
      metadata: { fields_changed: ['password'] },
    });
  }

  private async toProfileResponse(user: User): Promise<IAdminProfile> {
    const role = await this.userRoleModelAction.resolveHighestRole(user.id);
    if (!role) {
      throw new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_RESPONSE_ROLE_RESOLUTION_FAILED);
    }

    const response: AdminProfileResponseDto = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      country: user.country,
      avatar_url: user.avatar_url,
      role,
      created_at: user.created_at,
    };

    return response;
  }
}
