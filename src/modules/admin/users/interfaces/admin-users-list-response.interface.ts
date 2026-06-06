import { AdminUserItem } from './admin-user-item.interface';

export interface AdminUsersListMeta {
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface AdminUsersListResponse {
  data: AdminUserItem[];
  meta: AdminUsersListMeta;
}
