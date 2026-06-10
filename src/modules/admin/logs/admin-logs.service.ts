import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminLogsListAction, RawAdminLogRow } from './actions/admin-logs-list.action';
import { GetAdminLogsQueryDto } from './dto/get-admin-logs-query.dto';
import { AdminLogItem, AdminLogsListMeta, AdminLogsListResponse } from './interfaces/admin-logs.interfaces';
import { GeoLocationService } from './services/geo-location.service';
import { formatDevice } from './utils/parse-user-agent.util';

const MAX_PER_PAGE = 50;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const DELETED_USER_NAME = 'Deleted User';
/** A date-only ISO string is exactly 10 characters: YYYY-MM-DD. */
const DATE_ONLY_LENGTH = 10;

@Injectable()
export class AdminLogsService {
  constructor(
    private readonly adminLogsListAction: AdminLogsListAction,
    private readonly geoLocationService: GeoLocationService,
  ) {}

  /** Returns the paginated, filtered audit-log feed, newest first. */
  async listLogs(dto: GetAdminLogsQueryDto): Promise<AdminLogsListResponse> {
    const dateFrom = dto.date_from ? new Date(dto.date_from) : undefined;
    const dateTo = dto.date_to ? this.toInclusiveUpperBound(dto.date_to) : undefined;

    // EC-04: reject an inverted range with 422 before touching the database.
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new UnprocessableEntityException(SYS_MSG.ADMIN_LOGS_INVALID_DATE_RANGE);
    }

    const page = dto.page ?? DEFAULT_PAGE;
    const requestedPerPage = dto.per_page ?? DEFAULT_PER_PAGE;
    // EC-03: silently cap oversized page sizes and flag the response meta.
    const capped = requestedPerPage > MAX_PER_PAGE;
    const perPage = capped ? MAX_PER_PAGE : requestedPerPage;

    const [rows, total] = await this.adminLogsListAction.findLogsWithFilters({
      actionType: dto.action_type,
      status: dto.status,
      search: dto.search,
      dateFrom,
      dateTo,
      page,
      perPage,
    });

    const meta: AdminLogsListMeta = {
      total,
      page,
      per_page: perPage,
      has_next: page * perPage < total,
      ...(capped ? { capped: true } : {}),
    };

    // Resolve every row's location in one deduplicated pass before mapping.
    const locations = await this.geoLocationService.resolveMany(rows.map((row) => row.log_ip_address));

    return { data: rows.map((row, index) => this.toLogItem(row, locations[index])), meta };
  }

  /** Maps a raw joined row to the FR-3 response shape (EC-01: never a null reference). */
  private toLogItem(row: RawAdminLogRow, location: string | null): AdminLogItem {
    return {
      id: row.log_id,
      user_id: row.log_user_id,
      user_name: row.user_full_name ?? DELETED_USER_NAME,
      user_email: row.user_email,
      action_type: row.log_action_type,
      description: row.log_description,
      ip_address: row.log_ip_address,
      location,
      device: formatDevice(row.log_user_agent),
      created_at: row.log_created_at,
      status: row.log_status,
    };
  }

  /**
   * A date-only date_to (e.g. 2026-06-30) means "up to the end of that day";
   * widen it to 23:59:59.999 UTC so same-day entries are included.
   */
  private toInclusiveUpperBound(dateTo: string): Date {
    if (dateTo.length === DATE_ONLY_LENGTH) {
      return new Date(`${dateTo}T23:59:59.999Z`);
    }
    return new Date(dateTo);
  }
}
