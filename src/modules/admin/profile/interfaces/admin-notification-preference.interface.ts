import { AdminNotificationPreference } from '../entities/admin-notification-preference.entity';

export type AdminNotificationPreferenceUpdatePayload = Partial<
  Pick<AdminNotificationPreference, 'general_notifications' | 'push_email'>
>;

export const ADMIN_NOTIFICATION_PREFERENCE_FIELDS = ['general_notifications', 'push_email'] as const;

export interface AdminNotificationPreferencesResponse {
  generalNotifications: boolean;
  pushEmail: boolean;
}