import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  UnprocessableEntityException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { UserModelAction } from './actions/user.action';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import * as SYS_MSG from '../../constants/system.messages';
import { UserSessionModelAction } from './actions/user-session.action';
import { RedisService } from '../redis/redis.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthMetadataModelAction } from '../auth/actions/auth-metadata.action';
import { IUserProfile } from './interfaces/user-profile.interface';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ALLOWED_SSA_COUNTRIES } from './enums/allowed-ssa-countries.enum';
import { redisKeys } from '../../constants/redis-keys';

const BCRYPT_ROUNDS = 10;
const NO_TRANSACTION = {
  transactionOptions: { useTransaction: false as const },
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private readonly userModelAction: UserModelAction,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly authMetaModelAction: AuthMetadataModelAction,
    private readonly redisService: RedisService,
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
        (error as { driverError?: { code?: string } }).driverError?.code ===
          '23505'
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
          roles: [
            {
              role: UserRole.USER,
            },
          ],
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code ===
          '23505'
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
      throw new InternalServerErrorException(
        SYS_MSG.USER_UPDATE_FAILED,
      );
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
      throw new InternalServerErrorException(
        SYS_MSG.USER_UPDATE_FAILED,
      );
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
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.userSessionModelAction.findByUserId(userId);

    if (!sessions || sessions.length === 0) {
      this.logger.debug({
        message: 'No active sessions found to revoke',
        userId,
      });
      return;
    }

    const activeSessions = sessions.filter(s => !s.is_revoked);
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

  /** Verifies the current password, updates the hash, and revokes all active sessions. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findById(userId);

    if (!user.password_hash) {
      throw new UnprocessableEntityException({
        message: user.auth_provider === 'google' 
          ? SYS_MSG.PASSWORD_CHANGE_NOT_SUPPORTED
          : SYS_MSG.PASSWORD_CHANGE_UNAVAILABLE
      })
    }
    const oldPassword = dto.oldPassword;
    const newPassword = dto.newPassword;

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);

    if(!isOldPasswordValid) {
      throw new UnauthorizedException({
        message: SYS_MSG.INCORRECT_OLD_PASSWORD
      })
    }

    if(newPassword === oldPassword) {
      throw new BadRequestException({
        message: SYS_MSG.PASSWORD_CHANGE_NOT_SUCCESSFUL
      })
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new UnprocessableEntityException(SYS_MSG.INCORRECT_CONFIRM_PASSWORD);
    }

    const saveNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id: userId },
      updatePayload: { password_hash: saveNewPassword },
    })

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
      userId
    })
  }

   private toProfileResponse(user: User): IUserProfile {
    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      country: user.country,
      avatarUrl: user.avatar_url,
      authProvider: user.auth_provider,
      isVerified: user.is_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async getProfile(userId: string): Promise<IUserProfile> {
    const user = await this.findById(userId);
    return this.toProfileResponse(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserProfileDto & { email?: unknown },
  ): Promise<IUserProfile> {
    if ('email' in dto && dto.email !== undefined) {
      throw new UnprocessableEntityException(SYS_MSG.PROFILE_EMAIL_CHANGE_FORBIDDEN);
    }

    const user = await this.findById(userId);

    let normalisedCountry: string | undefined;
    if (dto.country !== undefined) {
      normalisedCountry = ALLOWED_SSA_COUNTRIES.find(
        (c) => c.toLowerCase() === dto.country!.toLowerCase(),
      );
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

    if (changedFields.length === 0) {
      return this.toProfileResponse(user);
    }

    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id: userId},
      updatePayload,
    })

    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.PROFILE_UPDATE_FAILED);
    }

    return this.toProfileResponse(updated);
  }
}
