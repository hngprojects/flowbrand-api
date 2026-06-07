import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { AdminLog } from '../entities/admin-log.entity';
import { AdminLogActionType, AdminLogStatus } from '../enums/admin-log.enum';

export interface AdminLogsListFilters {
  actionType?: AdminLogActionType;
  status?: AdminLogStatus;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  perPage: number;
}

export interface RawAdminLogRow {
  log_id: string;
  log_user_id: string | null;
  user_full_name: string | null;
  user_email: string | null;
  log_action_type: AdminLogActionType;
  log_description: string;
  log_ip_address: string | null;
  log_status: AdminLogStatus;
  log_created_at: Date;
}

@Injectable()
export class AdminLogsListAction {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Returns filtered, newest-first, paginated log rows alongside the total match count. */
  async findLogsWithFilters(filters: AdminLogsListFilters): Promise<[RawAdminLogRow[], number]> {
    const countQb = this.createFilteredQuery(filters);
    const total = await countQb.getCount();

    // SEC-02: explicit column list only — never SELECT * from admin_logs.
    const dataQb = this.createFilteredQuery(filters)
      .select('log.id', 'log_id')
      .addSelect('log.user_id', 'log_user_id')
      .addSelect('u.full_name', 'user_full_name')
      .addSelect('u.email', 'user_email')
      .addSelect('log.action_type', 'log_action_type')
      .addSelect('log.description', 'log_description')
      .addSelect('log.ip_address', 'log_ip_address')
      .addSelect('log.status', 'log_status')
      .addSelect('log.created_at', 'log_created_at');

    const rows = await dataQb
      .orderBy('log.created_at', 'DESC')
      .addOrderBy('log.id', 'ASC')
      .offset((filters.page - 1) * filters.perPage)
      .limit(filters.perPage)
      .getRawMany<RawAdminLogRow>();

    return [rows, total];
  }

  /**
   * Shared WHERE/JOIN base for the count and data queries. Soft-deleted users
   * are excluded from the join so their entries surface as 'Deleted User'.
   */
  private createFilteredQuery(filters: AdminLogsListFilters): SelectQueryBuilder<AdminLog> {
    const qb = this.dataSource
      .createQueryBuilder(AdminLog, 'log')
      .leftJoin(User, 'u', 'u.id = log.user_id AND u.deleted_at IS NULL');

    if (filters.actionType) {
      qb.andWhere('log.action_type = :actionType', { actionType: filters.actionType });
    }

    if (filters.status) {
      qb.andWhere('log.status = :status', { status: filters.status });
    }

    if (filters.search) {
      const escaped = filters.search.replace(/[%_]/g, '\\$&');
      qb.andWhere('(u.email ILIKE :search OR u.full_name ILIKE :search)', {
        search: `%${escaped}%`,
      });
    }

    if (filters.dateFrom) {
      qb.andWhere('log.created_at >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('log.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    return qb;
  }
}
