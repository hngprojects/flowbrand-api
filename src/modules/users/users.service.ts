import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QueryFailedError, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { UserModelAction } from './actions/user.action';
import { UserSessionModelAction } from './actions/user-session.action';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStateService } from './user-state.service';
import { UserStateResponse } from './interfaces/user-state.interface';
import * as SYS_MSG from '../../constants/system.messages';
import { IUserProfile } from './interfaces/user-profile.interface';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ALLOWED_SSA_COUNTRIES } from './enums/allowed-ssa-countries.enum';
import { ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';
import { PinoLoggerService } from './../../common/logger/pino-logger.service';

const BCRYPT_ROUNDS = 10;
const NO_TRANSACTION = {
  transactionOptions: { useTransaction: false as const },
};

@Injectable()
export class UsersService {
  constructor(
    private readonly userModelAction:UserModelAction,
    private readonly userStateService: UserStateService,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly logger: PinoLoggerService,
    @InjectQueue(ACCOUNT_DELETION_QUEUE)
    private readonly accountDeletionQueue: Queue,
    private readonly dataSource: DataSource,
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

  async getUserState(userId: string): Promise<UserStateResponse> {
    return this.userStateService.getUserState(userId);
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
      identifierOptions: { id: userId },
      updatePayload,
    });

    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.PROFILE_UPDATE_FAILED);
    }

    return this.toProfileResponse(updated);
  }

  async deleteAccount(userId: string, confirmation: string): Promise<{ message: string }> {
    // Defensive check (DTO already validates, but double-check)
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
    let committed = false
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const now = new Date();
      const thirtyDaysLater = 30 * 24 * 60 * 60 * 1000;

      await queryRunner.manager.update(User, userId, {
        deleted_at: now,
        is_active: false,
      });

      await this.userSessionModelAction.revokeAllUserSessions(userId, queryRunner.manager);

      if (user.auth_provider === 'google') {
        await queryRunner.manager.update(User, userId, { provider_user_id: null });
      }

      await queryRunner.commitTransaction();
      committed = true;

      this.logger.log('account.deleted', { userId });

      await this.accountDeletionQueue.add(
        'hard-delete',
        { userId, email: user.email },
        { delay: thirtyDaysLater },
      );

      return { message: SYS_MSG.ACCOUNT_DELETED_SUCCESSFULLY, };
    } catch (error) {
      if (!committed) {
        await queryRunner.rollbackTransaction();
      } 
      
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('account.deletion.failed', {
        userId,
        error: errorMessage,
        committed
      });

      if (committed) {
      this.logger.warn('account.deleted.but.queue.failed', { userId, error: errorMessage });
        return { message: SYS_MSG.ACCOUNT_DELETED_SUCCESSFULLY, };
      }

      throw new InternalServerErrorException(SYS_MSG.ACCOUNT_DELETION_FAILED);
    } finally {
      await queryRunner.release();
    }
  }
}
