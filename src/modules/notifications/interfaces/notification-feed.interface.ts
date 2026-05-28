export interface NotificationFeedItem {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  read_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface NotificationFeedResponse {
  items: NotificationFeedItem[];
  total_count: number;
  unread_count: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface NotificationCountResponse {
  count: number;
}

export interface NotificationBulkUpdateResponse {
  updated_count: number;
}