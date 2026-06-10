import { AdminLogActionType, AdminLogStatus } from '../enums/admin-log.enum';

/** Per-entry response shape (FR-3). Only these fields may ever be returned. */
export interface AdminLogItem {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  action_type: AdminLogActionType;
  description: string;
  ip_address: string | null;
  /** "Region, CC" derived from ip_address, or null when it cannot be resolved. */
  location: string | null;
  /** "Browser Major · OS Version" parsed from the stored user agent, or null. */
  device: string | null;
  created_at: Date;
  status: AdminLogStatus;
}

export interface AdminLogsListMeta {
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
  /** Present (true) only when the requested per_page exceeded the cap of 50. */
  capped?: boolean;
}

export interface AdminLogsListResponse {
  data: AdminLogItem[];
  meta: AdminLogsListMeta;
}
