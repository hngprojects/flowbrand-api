import { ConflictException, Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserModelAction } from '../../users/actions/user.action';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { UsersService } from '../../users/users.service';
import { UserPlan } from '../../users/enums/user-plan.enum';
import { UserAccountStatus } from '../../users/enums/user-account-status.enum';
import { ACCOUNT_DELETION_QUEUE } from '../../users/processors/account-deletion.processor';
import { RedisService } from '../../redis/redis.service';
import { LogService } from '../profile/services/log.service';
import { AdminProfileActionType } from '../profile/enums/admin-profile-action-type.enum';
import { ACTIVE_WINDOW_DAYS, AdminUsersListAction } from './actions/admin-users-list.action';
import { AdminUserDetailAction } from './actions/admin-user-detail.action';
import { CreateAdminDto } from './dto/create-admin.dto';
import { GetAdminUsersQueryDto } from './dto/get-admin-users-query.dto';
import { AdminUserDetailResponseDto } from './dto/admin-user-detail-response.dto';
import { SortDir, UserSortBy, UserStatusFilter } from './enums/admin-users-query.enum';
import { AdminUsersListResponse } from './interfaces/admin-users-list-response.interface';
import { AdminUserItem } from './interfaces/admin-user-item.interface';

const MAX_PER_PAGE = 50;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userModelAction: UserModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly dataSource: DataSource,
    private readonly adminUsersListAction: AdminUsersListAction,
    private readonly adminUserDetailAction: AdminUserDetailAction,
    private readonly logService: LogService,
    private readonly redisService: RedisService,
    @InjectQueue(ACCOUNT_DELETION_QUEUE)
    private readonly accountDeletionQueue: Queue,
  ) {}

  /** Creates a new admin or super-admin account and assigns the specified role. */
  async createAdmin(dto: CreateAdminDto): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(SYS_MSG.ADMIN_EMAIL_CONFLICT);
    }

    try {
      const passwordHash = await bcrypt.hash(dto.password, 12);
      await this.dataSource.transaction(async (manager) => {
        const user = await this.userModelAction.create({
          createPayload: {
            email: dto.email,
            full_name: dto.full_name,
            password_hash: passwordHash,
            is_verified: true,
            termsAccepted: true,
          },
          transactionOptions: { useTransaction: true, transaction: manager },
        });

        await this.userRoleModelAction.create({
          createPayload: { user_id: user.id, role: dto.role },
          transactionOptions: { useTransaction: true, transaction: manager },
        });
      });
    } catch (error: unknown) {
      if (this.isUniqueEmailConflict(error)) {
        throw new ConflictException(SYS_MSG.ADMIN_EMAIL_CONFLICT);
      }
      throw error;
    }

    return { message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY };
  }

  /** Returns a paginated, filtered list of platform users for admin review. */
  async listUsers(dto: GetAdminUsersQueryDto): Promise<AdminUsersListResponse> {
    const status = dto.status ?? UserStatusFilter.ALL;
    const page = dto.page ?? DEFAULT_PAGE;
    const perPage = Math.min(dto.perPage ?? DEFAULT_PER_PAGE, MAX_PER_PAGE);
    const sortBy = dto.sortBy ?? UserSortBy.CREATED_AT;
    const sortDir = dto.sortDir ?? SortDir.DESC;

    const [rows, total] = await this.adminUsersListAction.findUsersWithFilters(
      status,
      dto.search,
      page,
      perPage,
      sortBy,
      sortDir,
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - ACTIVE_WINDOW_DAYS);

    const data: AdminUserItem[] = rows.map((row) => {
      const lastActiveAt = row.auth_last_login_at ? new Date(row.auth_last_login_at) : null;
      const isActive = lastActiveAt !== null && lastActiveAt > thirtyDaysAgo;

      return {
        id: row.user_id,
        full_name: row.user_full_name,
        email: row.user_email,
        plan: row.user_plan as UserPlan,
        status: isActive ? UserStatusFilter.ACTIVE : UserStatusFilter.INACTIVE,
        created_at: new Date(row.user_created_at),
        last_active_at: lastActiveAt,
        funnel_count: parseInt(row.funnel_count, 10),
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        per_page: perPage,
        has_next: page * perPage < total,
      },
    };
  }

  async getUserProfile(userId: string): Promise<AdminUserDetailResponseDto> {
    const { user, funnels, documents } = await this.adminUserDetailAction.findUserWithDetails(userId);

    if (!user) {
      throw new NotFoundException(SYS_MSG.ADMIN_USER_NOT_FOUND);
    }

    let statusIndicator: UserAccountStatus | 'deleted' = user.status;
    if (user.deleted_at) {
      statusIndicator = 'deleted';
    }

    return {
      profile: {
        fullName: user.full_name,
        email: user.email,
        plan: user.plan,
        country: user.country,
        createdAt: user.created_at,
        lastActiveAt: user.auth_metadata?.last_login_at ?? null,
        status: statusIndicator,
      },
      informationProvided: {
        businessType: user.business_type,
        targetCustomer: user.target_customer,
        primaryGoal: user.primary_goal,
      },
      strategies: funnels.map(f => ({
        id: f.id,
        funnelName: f.funnel_name,
        stageCount: f.stage_count,
        createdAt: f.created_at,
        status: f.status,
      })),
      documents: documents.map(d => ({
        id: d.id,
        fileName: d.file_name,
        fileSizeBytes: d.file_size_bytes,
        uploadedAt: d.created_at,
        status: d.status,
      })),
    };
  }

  async updateUserStatus(userId: string, status: UserAccountStatus, adminId: string): Promise<void> {
    const user = await this.userModelAction.findById(userId);
    if (!user) {
      throw new NotFoundException(SYS_MSG.ADMIN_USER_NOT_FOUND);
    }

    if (user.deleted_at && status !== UserAccountStatus.ACTIVE) {
      throw new ConflictException('Cannot change status of a deleted user unless reactivating');
    }

    if (status === UserAccountStatus.DELETED) {
      return this.deleteUser(userId, adminId);
    }

    const isActive = status === UserAccountStatus.ACTIVE;
    const deletedAt = status === UserAccountStatus.ACTIVE ? null : user.deleted_at;

    await this.userModelAction.update({
      identifierOptions: { id: userId },
      updatePayload: { status, is_active: isActive, deleted_at: deletedAt },
      transactionOptions: { useTransaction: false },
    });

    await this.logService.logAction({
      admin_id: adminId,
      action_type: AdminProfileActionType.ADMIN_STATUS_CHANGE,
      status: 'success',
      metadata: { targetUserId: userId, newStatus: status },
    });
  }

  async deleteUser(userId: string, adminId: string): Promise<void> {
    if (userId === adminId) {
      throw new ForbiddenException(SYS_MSG.ADMIN_CANNOT_DELETE_SELF);
    }

    const user = await this.userModelAction.findById(userId);
    if (!user) {
      throw new NotFoundException(SYS_MSG.ADMIN_USER_NOT_FOUND);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    let committed = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const now = new Date();
      await queryRunner.manager.update(
        user.constructor,
        userId,
        {
          deleted_at: now,
          is_active: false,
          status: UserAccountStatus.DELETED,
          ...(user.auth_provider === 'google' ? { provider_user_id: null } : {}),
        }
      );

      const revokedSessionIds = await this.userSessionModelAction.revokeAllUserSessionsInDb(
        userId,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
      committed = true;

      try {
        if (revokedSessionIds.length > 0) {
          await this.redisService.delByPattern(`sess:${userId}:*`);
        }

        await this.accountDeletionQueue.add('hard-delete', { userId, email: user.email }, { delay: 30 * 24 * 60 * 60 * 1000 });

        await this.logService.logAction({
          admin_id: adminId,
          action_type: AdminProfileActionType.ADMIN_ACCOUNT_DELETED,
          status: 'success',
          metadata: { targetUserId: userId },
        });
      } catch (err) {
        console.error('Post-commit deletion tasks failed:', err);
      }
    } catch {
      if (!committed) {
        await queryRunner.rollbackTransaction();
        throw new InternalServerErrorException(SYS_MSG.ACCOUNT_DELETION_FAILED);
      }
    } finally {
      await queryRunner.release();
    }
  }

  private isUniqueEmailConflict(error: unknown): boolean {
    return (
      error instanceof ConflictException ||
      Boolean(
        error &&
        typeof error === 'object' &&
        'driverError' in error &&
        (error as { driverError?: { code?: string } }).driverError?.code === '23505',
      )
    );
  }
}
