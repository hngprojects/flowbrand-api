import { Injectable, NotFoundException } from '@nestjs/common';
import * as SYS_MSG from '../../constants/system.messages';
import { NotificationModelAction } from './actions/notification.action';
import { Notification } from './entities/notification.entity';
import { NotificationFilter } from './enums/notification-filter.enum';
import {
  NotificationBulkUpdateResponse,
  NotificationCountResponse,
  NotificationFeedResponse,
} from './interfaces/notification-feed.interface';

const TYPE_MAX = 50;
const TITLE_MAX = 120;
const METADATA_STRING_MAX = 500;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;

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
      createPayload: { user_id: userId, type: type.slice(0, TYPE_MAX), title: title.slice(0, TITLE_MAX), body, metadata: sanitisedMetadata },
      transactionOptions: { useTransaction: false },
    });
  }

  normalizePagination(page?: number, perPage?: number) {
    const normalisedPage = page && page >= 1 ? page : DEFAULT_PAGE;
    const normalisedPerPage = !perPage || perPage <= 0 ? DEFAULT_PER_PAGE : Math.min(perPage, MAX_PER_PAGE);

    return {
      page: normalisedPage,
      per_page: normalisedPerPage,
    };
  }

  async getFeed(
    userId: string,
    filter: NotificationFilter = NotificationFilter.ALL,
    page?: number,
    perPage?: number,
  ): Promise<NotificationFeedResponse> {
    const { page: currentPage, per_page } = this.normalizePagination(page, perPage);
    const [items, totalCount] = await this.notificationAction.listForUserPaginated(userId, filter, currentPage, per_page);
    const unreadCount = await this.notificationAction.countUnread(userId);

    return {
      items,
      total_count: totalCount,
      unread_count: unreadCount,
      page: currentPage,
      per_page,
      has_next: currentPage * per_page < totalCount,
    };
  }

  async getUnreadCount(userId: string): Promise<NotificationCountResponse> {
    const count = await this.notificationAction.countUnread(userId);
    return { count };
  }

  async markRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationAction.findOwnedById(notificationId, userId);
    if (!notification) {
      throw new NotFoundException(SYS_MSG.NOTIFICATION_NOT_FOUND);
    }

    if (!notification.is_read) {
      await this.notificationAction.markAsRead(notificationId, userId);
      const updated = await this.notificationAction.findOwnedById(notificationId, userId);
      if (!updated) {
        throw new NotFoundException(SYS_MSG.NOTIFICATION_NOT_FOUND);
      }

      return updated;
    }

    return notification;
  }

  async markAllAsRead(userId: string): Promise<NotificationBulkUpdateResponse> {
    const updatedCount = await this.notificationAction.markAllAsRead(userId);
    return { updated_count: updatedCount };
  }

  async markAllAsUnread(userId: string): Promise<NotificationBulkUpdateResponse> {
    const updatedCount = await this.notificationAction.markAllAsUnread(userId);
    return { updated_count: updatedCount };
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notification = await this.notificationAction.findOwnedById(notificationId, userId);
    if (!notification) {
      throw new NotFoundException(SYS_MSG.NOTIFICATION_NOT_FOUND);
    }

    await this.notificationAction.deleteOwnedById(notificationId, userId);
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
