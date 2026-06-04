import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserModelAction } from '../../users/actions/user.action';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UsersService } from '../../users/users.service';
import { UserPlan } from '../../users/enums/user-plan.enum';
import { AdminUsersListAction } from './actions/admin-users-list.action';
import { CreateAdminDto } from './dto/create-admin.dto';
import { GetAdminUsersQueryDto } from './dto/get-admin-users-query.dto';
import { SortDir, UserSortBy, UserStatusFilter } from './enums/admin-users-query.enum';
import { AdminUserItem } from './interfaces/admin-user-item.interface';
import { AdminUsersListResponse } from './interfaces/admin-users-list-response.interface';

const MAX_PER_PAGE = 50;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const ACTIVE_WINDOW_DAYS = 30;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userModelAction: UserModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly dataSource: DataSource,
    private readonly adminUsersListAction: AdminUsersListAction,
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
