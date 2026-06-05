import { AdminNotificationType } from '../enums/admin-notification.enum';

/** Single feed item; internal columns like updated_at are never exposed. */
export interface AdminNotificationFeedItem {
  id: string;
  type: AdminNotificationType;
  title: string;
  message: string;
  sender_name: string | null;
  sender_avatar_url: string | null;
  is_read: boolean;
  is_starred: boolean;
  read_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/** Feed meta block; unread_count is always the unfiltered total (FR-2). */
export interface AdminNotificationFeedMeta {
  total: number;
  unread_count: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

/** Response payload for GET /admin/notifications (FR-2). */
export interface AdminNotificationFeedResponse {
  data: AdminNotificationFeedItem[];
  meta: AdminNotificationFeedMeta;
}

export interface AdminNotificationUpdateResponse {
  updated_count: number;
}

export interface AdminNotificationDeleteResponse {
  deleted_count: number;
}
