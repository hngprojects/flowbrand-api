import { Injectable, NotFoundException } from '@nestjs/common';
import * as SYS_MSG from '../../constants/system.messages';
import { NotificationModelAction } from './actions/notification.action';
import { Notification } from './entities/notification.entity';
import { NotificationFilter } from './enums/notification-filter.enum';
import {
  NotificationBulkUpdateResponse,
  NotificationCountResponse,
  NotificationFeedResponse,
  NotificationFeedItem,
} from './interfaces/notification-feed.interface';

const TYPE_MAX = 50;
const TITLE_MAX = 120;
const METADATA_STRING_MAX = 500;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;
// METADATA_STRING_MAX defined above
const METADATA_TOTAL_MAX = 5000;
const BODY_MAX = 2000;

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
    // sanitize metadata recursively and cap total metadata size
    const sanitized = this.sanitizeMetadataRecursive(metadata) as Record<string, unknown>;
    let finalMetadata: Record<string, unknown> = sanitized;
    try {
      const jsonLen = JSON.stringify(sanitized).length;
      if (jsonLen > METADATA_TOTAL_MAX) {
        finalMetadata = { _truncated: true };
      }
    } catch (e) {
      finalMetadata = { _truncated: true };
    }

    const safeBody = typeof body === 'string' && body.length > BODY_MAX ? body.slice(0, BODY_MAX) : body;

    return this.notificationAction.create({
      createPayload: {
        user_id: userId,
        type: type.slice(0, TYPE_MAX),
        title: title.slice(0, TITLE_MAX),
        body: safeBody,
        metadata: finalMetadata,
      },
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

    // map entities to DTO to avoid leaking internal fields like `user_id` or `updated_at`
    const mappedItems: NotificationFeedItem[] = items.map((n) => this.mapToFeedItem(n));

    return {
      items: mappedItems,
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

  private mapToFeedItem(n: Notification): NotificationFeedItem {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      is_read: n.is_read,
      read_at: n.read_at,
      metadata: n.metadata ?? {},
      created_at: n.created_at,
    };
  }

  private truncateMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    // shallow truncate kept for compatibility; prefer recursive sanitization via `sanitizeMetadata`
    return Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [
        k,
        typeof v === 'string' && v.length > METADATA_STRING_MAX ? v.slice(0, METADATA_STRING_MAX) : v,
      ]),
    );
  }

  private sanitizeMetadataRecursive(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.length > METADATA_STRING_MAX ? value.slice(0, METADATA_STRING_MAX) : value;
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeMetadataRecursive(v));
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = this.sanitizeMetadataRecursive(v);
      }
      return out;
    }

    return value;
  }
}
