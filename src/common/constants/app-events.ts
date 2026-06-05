/**
 * Centralised event name registry. Every domain event that triggers an
 * activity log entry or notification must have a key here.
 *
 * Naming convention: '<aggregate>.<past-tense-verb>'
 * The wildcard delimiter is '.', so 'stage.*' matches all stage events.
 *
 * RULE: emit AFTER the database write completes — after commitTransaction() for
 * transactional writes, or after the save/update call for non-transactional ones.
 * Never emit inside a transaction: if it rolls back, the event must not have fired.
 */
export const APP_EVENTS = {
  // Funnel lifecycle
  FUNNEL_GENERATED: 'funnel.generated',
  FUNNEL_FAILED: 'funnel.failed',
  FUNNEL_RENAMED: 'funnel.renamed',

  // Stage progression
  STAGE_UNLOCKED: 'stage.unlocked',
  STAGE_COMPLETED: 'stage.completed',

  // Task interactions
  TASK_COMPLETED: 'task.completed',
  TASK_REOPENED: 'task.reopened',

  // Feedback
  FEEDBACK_SUBMITTED: 'feedback.submitted',

  // User account
  // Emission deferred — wired in AuthService once ActivityLogListener ships.
  USER_SIGNED_UP: 'user.signed_up',
  USER_SIGNED_IN: 'user.signed_in',
  PROFILE_UPDATED: 'user.profile_updated',
  // Emission wired once the change-password endpoint is merged
  PASSWORD_CHANGED: 'user.password_changed',
  ACCOUNT_DELETED: 'user.account_deleted',

  // Payment / subscription lifecycle
  PLAN_UPGRADED: 'plan.upgraded',
  PAYMENT_FAILED: 'payment.failed',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',

  // Notification system
  // Emitted by WeeklyDigestProcessor for users with unread notifications — consumed by NotificationListener.
  NOTIFICATIONS_PENDING: 'notifications.pending',
} as const;

export type AppEvent = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];
