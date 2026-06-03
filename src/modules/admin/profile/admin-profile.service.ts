import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserRole } from '../../users/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { AdminProfileModelAction } from './actions/admin-profile.action';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { IAdminProfile } from './interfaces/admin-profile.interface';
import { LogService } from './services/log.service';

@Injectable()
export class AdminProfileService {
  private readonly logger = new Logger(AdminProfileService.name);

  constructor(
    private readonly adminProfileAction: AdminProfileModelAction,
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
      action_type: 'profile_updated',
      metadata: { updated_fields: changedFields },
    });

    return this.toProfileResponse(updated, fallbackRole);
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
}
