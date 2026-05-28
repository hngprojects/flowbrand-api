import { Injectable } from '@nestjs/common';
import { NotificationModelAction } from './actions/notification.action';
import { Notification } from './entities/notification.entity';

const METADATA_STRING_MAX = 500;

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationAction: NotificationModelAction) {}

  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    metadata: Record<string, unknown> = {},
  ): Promise<Notification> {
    const sanitisedMetadata = this.truncateMetadata(metadata);
    return this.notificationAction.create({
      createPayload: { user_id: userId, type, title, body, metadata: sanitisedMetadata },
      transactionOptions: { useTransaction: false },
    });
  }

  private truncateMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [
        k,
        typeof v === 'string' && v.length > METADATA_STRING_MAX ? v.slice(0, METADATA_STRING_MAX) : v,
      ]),
    );
  }
}
