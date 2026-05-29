import { NotificationPreference } from '../entities/notification-preference.entity';

export type NotificationPreferenceUpdatePayload = Partial<
  Pick<
    NotificationPreference,
    | 'email_funnel_ready'
    | 'email_stage_unlocked'
    | 'email_stage_completed'
    | 'email_weekly_digest'
    | 'inapp_task_completed'
    | 'inapp_stage_unlocked'
  >
>;

export const NOTIFICATION_PREFERENCE_FIELDS = [
  'email_funnel_ready',
  'email_stage_unlocked',
  'email_stage_completed',
  'email_weekly_digest',
  'inapp_task_completed',
  'inapp_stage_unlocked',
] as const;
