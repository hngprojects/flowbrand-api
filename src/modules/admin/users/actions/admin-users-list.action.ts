import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthMetadata } from '../../../auth/entities/auth-metadata.entity';
import { Funnel } from '../../../funnels/entities/funnel.entity';
import { FunnelStatus } from '../../../funnels/enums/funnel-status.enum';
import { User } from '../../../users/entities/user.entity';
import { SortDir, UserSortBy, UserStatusFilter } from '../enums/admin-users-query.enum';

const ACTIVE_WINDOW_DAYS = 30;

const SORT_COLUMN_MAP: Record<UserSortBy, string> = {
  [UserSortBy.CREATED_AT]: 'user.created_at',
  [UserSortBy.LAST_ACTIVE_AT]: 'auth.last_login_at',
  [UserSortBy.FULL_NAME]: 'user.full_name',
};

export interface RawAdminUserRow {
  user_id: string;
  user_full_name: string;
  user_email: string;
  user_plan: string;
  user_created_at: Date;
  auth_last_login_at: Date | null;
  funnel_count: string;
}

@Injectable()
export class AdminUsersListAction {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Returns filtered, sorted, paginated non-deleted users alongside the total match count. */
  async findUsersWithFilters(
    status: UserStatusFilter,
    search: string | undefined,
    page: number,
    perPage: number,
    sortBy: UserSortBy,
    sortDir: SortDir,
  ): Promise<[RawAdminUserRow[], number]> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - ACTIVE_WINDOW_DAYS);

    // Count query — lightweight, no subquery, used for pagination meta
    const countQb = this.dataSource
      .createQueryBuilder(User, 'user')
      .leftJoin(AuthMetadata, 'auth', 'auth.user_id = user.id')
      .where('user.deleted_at IS NULL');

    if (status === UserStatusFilter.ACTIVE) {
      countQb.andWhere('auth.last_login_at > :threshold', { threshold });
    } else if (status === UserStatusFilter.INACTIVE) {
      countQb.andWhere(
        '(auth.last_login_at IS NULL OR auth.last_login_at <= :threshold)',
        { threshold },
      );
    }

    if (search) {
      countQb.andWhere(
        '(user.email ILIKE :search OR user.full_name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await countQb.getCount();

    // Data query — includes funnel_count subquery, ORDER BY, and pagination
    const dataQb = this.dataSource
      .createQueryBuilder(User, 'user')
      .select('user.id', 'user_id')
      .addSelect('user.full_name', 'user_full_name')
      .addSelect('user.email', 'user_email')
      .addSelect('user.plan', 'user_plan')
      .addSelect('user.created_at', 'user_created_at')
      .addSelect('auth.last_login_at', 'auth_last_login_at')
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(f.id)')
            .from(Funnel, 'f')
            .where('f.user_id = user.id')
            .andWhere('f.status = :funnelStatus', { funnelStatus: FunnelStatus.ACTIVE }),
        'funnel_count',
      )
      .leftJoin(AuthMetadata, 'auth', 'auth.user_id = user.id')
      .where('user.deleted_at IS NULL');

    if (status === UserStatusFilter.ACTIVE) {
      dataQb.andWhere('auth.last_login_at > :threshold', { threshold });
    } else if (status === UserStatusFilter.INACTIVE) {
      dataQb.andWhere(
        '(auth.last_login_at IS NULL OR auth.last_login_at <= :threshold)',
        { threshold },
      );
    }

    if (search) {
      dataQb.andWhere(
        '(user.email ILIKE :search OR user.full_name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await dataQb
      .orderBy(SORT_COLUMN_MAP[sortBy], sortDir === SortDir.ASC ? 'ASC' : 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getRawMany<RawAdminUserRow>();

    return [rows, total];
  }
}
