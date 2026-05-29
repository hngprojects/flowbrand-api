import { Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { NotificationModelAction } from './actions/notification.action';
import { NotificationPreferenceModelAction } from './actions/notification-preference.action';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import {
  NOTIFICATION_PREFERENCE_FIELDS,
  NotificationPreferenceUpdatePayload,
} from './interfaces/notification-preference.interface';

const TYPE_MAX = 50;
const TITLE_MAX = 120;
const METADATA_STRING_MAX = 500;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationAction: NotificationModelAction,
    private readonly preferenceAction: NotificationPreferenceModelAction,
  ) {}

  /** Creates an in-app notification after sanitising untrusted metadata. */
  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    metadata: Record<string, unknown> = {},
  ): Promise<Notification> {
    const sanitisedMetadata = this.truncateMetadata(metadata);
    return this.notificationAction.create({
      createPayload: {
        user_id: userId,
        type: type.slice(0, TYPE_MAX),
        title: title.slice(0, TITLE_MAX),
        body,
        metadata: sanitisedMetadata,
      },
      transactionOptions: { useTransaction: false },
    });
  }

  /** Returns the user's notification preferences, creating defaults when absent. */
  async getNotificationPreferences(userId: string): Promise<NotificationPreference> {
    const existing = await this.preferenceAction.findByUserId(userId);
    if (existing) {
      return existing;
    }

    try {
      return await this.preferenceAction.createDefaultForUser(userId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const createdByConcurrentRequest = await this.preferenceAction.findByUserId(userId);
        if (createdByConcurrentRequest) {
          return createdByConcurrentRequest;
        }
      }

      throw error;
    }
  }

  /** Partially updates notification preferences or returns current values for empty updates. */
  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    const updatePayload = this.toPreferenceUpdatePayload(dto);

    if (Object.keys(updatePayload).length === 0) {
      return this.getNotificationPreferences(userId);
    }

    await this.getNotificationPreferences(userId);
    const updated = await this.preferenceAction.updateByUserId(userId, updatePayload);
    if (updated) {
      return updated;
    }

    const recreated = await this.getNotificationPreferences(userId);
    return (await this.preferenceAction.updateByUserId(userId, updatePayload)) ?? recreated;
  }

  private truncateMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [
        k,
        typeof v === 'string' && v.length > METADATA_STRING_MAX ? v.slice(0, METADATA_STRING_MAX) : v,
      ]),
    );
  }

  private toPreferenceUpdatePayload(dto: UpdateNotificationPreferencesDto): NotificationPreferenceUpdatePayload {
    return NOTIFICATION_PREFERENCE_FIELDS.reduce<NotificationPreferenceUpdatePayload>((payload, field) => {
      if (dto[field] !== undefined) {
        payload[field] = dto[field];
      }

      return payload;
    }, {});
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError && (error as { driverError?: { code?: string } }).driverError?.code === '23505'
    );
  }
}
