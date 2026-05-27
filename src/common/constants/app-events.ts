/**
 * Centralised event name registry. Every domain event that triggers an
 * activity log entry or notification must have a key here.
 *
 * Naming convention: '<aggregate>.<past-tense-verb>'
 * The wildcard delimiter is '.', so 'stage.*' matches all stage events.
 *
 * RULE: emit AFTER queryRunner.commitTransaction() — never inside a transaction.
 * If the transaction rolls back, the event must not have fired.
 */
export const APP_EVENTS = {
  // Funnel lifecycle
  FUNNEL_GENERATED:   'funnel.generated',
  FUNNEL_FAILED:      'funnel.failed',

  // Stage progression
  STAGE_UNLOCKED:     'stage.unlocked',
  STAGE_COMPLETED:    'stage.completed',

  // Task interactions
  TASK_COMPLETED:     'task.completed',
  TASK_REOPENED:      'task.reopened',

  // Feedback
  FEEDBACK_SUBMITTED: 'feedback.submitted',

  // User account
  PROFILE_UPDATED:    'user.profile_updated',
  PASSWORD_CHANGED:   'user.password_changed',
  ACCOUNT_DELETED:    'user.account_deleted',
} as const;

export type AppEvent = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];
