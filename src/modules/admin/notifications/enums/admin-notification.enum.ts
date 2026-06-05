/** Notification categories shown as filter tabs in the admin portal (FR-1). */
export enum AdminNotificationType {
  MENTION = 'mention',
  RISK = 'risk',
  MILESTONE = 'milestone',
  FEEDBACK = 'feedback',
}

/** Type filter for the feed; 'all' disables type filtering (FR-2). */
export enum AdminNotificationTypeFilter {
  ALL = 'all',
  MENTION = 'mention',
  RISK = 'risk',
  MILESTONE = 'milestone',
  FEEDBACK = 'feedback',
}

/** Read-state filter for the feed (FR-2). */
export enum AdminNotificationReadFilter {
  ALL = 'all',
  UNREAD = 'unread',
  READ = 'read',
}
