import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { User } from '../../users/entities/user.entity';
import { AdminProfileModelAction } from './actions/admin-profile.action';
import { AdminProfileResponseDto } from './dto/admin-profile-response.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { IAdminProfile } from './interfaces/admin-profile.interface';
import { LogService } from './services/log.service';

@Injectable()
export class AdminProfileService {
  constructor(
    private readonly adminProfileAction: AdminProfileModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly logService: LogService,
  ) {}

  async getProfile(adminId: string): Promise<IAdminProfile> {
    const admin = await this.adminProfileAction.findById(adminId);
    if (!admin) {
      throw new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND);
    }

    return this.toProfileResponse(admin);
  }

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
      action_type: 'profile_updated',
      metadata: { updated_fields: changedFields },
    });

    return this.toProfileResponse(updated);
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
