import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as SYS_MSG from '../../../../constants/system.messages';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UserRole } from '../../../users/enums/user-role.enum';
import { AdminNotificationModelAction } from '../actions/admin-notification.action';
import { BulkSelectionDto } from '../dto/bulk-selection.dto';
import { ListAdminNotificationsQueryDto } from '../dto/list-admin-notifications.query.dto';
import { AdminNotification } from '../entities/admin-notification.entity';
import {
  AdminNotificationReadFilter,
  AdminNotificationType,
  AdminNotificationTypeFilter,
} from '../enums/admin-notification.enum';
import {
  AdminNotificationDeleteResponse,
  AdminNotificationFeedItem,
  AdminNotificationFeedResponse,
  AdminNotificationUpdateResponse,
} from '../interfaces/admin-notification.interface';

const TITLE_MAX = 120;
const SENDER_NAME_MAX = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

export interface AdminNotificationSender {
  sender_name?: string | null;
  sender_avatar_url?: string | null;
}

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly notificationAction: AdminNotificationModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
  ) {}

  /** FR-2: paginated, filterable feed; meta.unread_count is always the unfiltered unread total. */
  async getFeed(adminId: string, query: ListAdminNotificationsQueryDto): Promise<AdminNotificationFeedResponse> {
    const page = query.page && query.page >= 1 ? query.page : DEFAULT_PAGE;
    const perPage = !query.per_page || query.per_page <= 0 ? DEFAULT_PER_PAGE : Math.min(query.per_page, MAX_PER_PAGE);

    const [items, total] = await this.notificationAction.listForAdminPaginated(
      adminId,
      query.type ?? AdminNotificationTypeFilter.ALL,
      query.read ?? AdminNotificationReadFilter.ALL,
      query.starred,
      page,
      perPage,
    );
    const unreadCount = await this.notificationAction.countUnread(adminId);

    return {
      data: items.map((n) => this.mapToFeedItem(n)),
      meta: {
        total,
        unread_count: unreadCount,
        page,
        per_page: perPage,
        has_next: page * perPage < total,
      },
    };
  }

  /** FR-3: scoped mark-as-read; 404 when the notification is missing or owned by another admin. */
  async markRead(adminId: string, notificationId: string): Promise<AdminNotificationFeedItem> {
    const notification = await this.notificationAction.findOwnedById(notificationId, adminId);
    if (!notification) {
      throw new NotFoundException(SYS_MSG.ADMIN_NOTIFICATION_NOT_FOUND);
    }

    if (notification.is_read) {
      return this.mapToFeedItem(notification);
    }

    await this.notificationAction.markAsRead(notificationId, adminId);
    // Construct the updated state from the row already in hand; no third query needed.
    return this.mapToFeedItem({ ...notification, is_read: true, read_at: new Date() });
  }

  /** FR-4: all-read (optionally one type); zero-write no-op returning 200 when everything is already read (EC-02). */
  async markAllRead(adminId: string, type?: AdminNotificationType): Promise<AdminNotificationUpdateResponse> {
    const updatedCount = await this.notificationAction.markAllAsRead(adminId, type);
    return { updated_count: updatedCount };
  }

  /** FR-8: mark selected (or all) as unread; non-owned ids are ignored, empty ids is a no-op. */
  async markUnread(adminId: string, selection: BulkSelectionDto): Promise<AdminNotificationUpdateResponse> {
    this.assertSelection(selection);

    const updatedCount =
      selection.all === true
        ? await this.notificationAction.markAllUnread(adminId)
        : await this.notificationAction.markUnreadByIds(adminId, selection.ids ?? []);

    return { updated_count: updatedCount };
  }

  /** FR-5: scoped hard delete; 404 when the notification is missing or owned by another admin. */
  async deleteOne(adminId: string, notificationId: string): Promise<void> {
    const deletedCount = await this.notificationAction.deleteOwnedById(notificationId, adminId);
    if (deletedCount === 0) {
      throw new NotFoundException(SYS_MSG.ADMIN_NOTIFICATION_NOT_FOUND);
    }
  }

  /** FR-6: bulk delete; ids are filtered to owned rows, all:true stays scoped to the admin (EC-03, SEC-02). */
  async bulkDelete(adminId: string, selection: BulkSelectionDto): Promise<AdminNotificationDeleteResponse> {
    this.assertSelection(selection);

    const deletedCount =
      selection.all === true
        ? await this.notificationAction.deleteAllForAdmin(adminId)
        : await this.notificationAction.deleteOwnedByIds(adminId, selection.ids ?? []);

    return { deleted_count: deletedCount };
  }

  /** FR-7: atomically toggle is_starred and return the updated notification; 404 when not owned. */
  async toggleStar(adminId: string, notificationId: string): Promise<AdminNotificationFeedItem> {
    const updated = await this.notificationAction.toggleStarred(notificationId, adminId);
    if (!updated) {
      throw new NotFoundException(SYS_MSG.ADMIN_NOTIFICATION_NOT_FOUND);
    }

    return this.mapToFeedItem(updated);
  }

  /** FR-9: creates one notification for one admin. */
  async createNotification(
    adminId: string,
    type: AdminNotificationType,
    title: string,
    message: string,
    metadata: Record<string, unknown> = {},
    sender: AdminNotificationSender = {},
  ): Promise<AdminNotification> {
    return this.notificationAction.create({
      createPayload: this.toCreatePayload(adminId, type, title, message, metadata, sender),
      transactionOptions: { useTransaction: false },
    });
  }

  /** FR-9: fans one platform event out to every active admin and super admin in a single INSERT. */
  async notifyAllAdmins(
    type: AdminNotificationType,
    title: string,
    message: string,
    metadata: Record<string, unknown> = {},
    sender: AdminNotificationSender = {},
  ): Promise<number> {
    const adminIds = await this.findAdminIds();
    return this.notificationAction.createMany(
      adminIds.map((adminId) => this.toCreatePayload(adminId, type, title, message, metadata, sender)),
    );
  }

  /** Distinct active admin/super admin user ids (deleted accounts are excluded). */
  private async findAdminIds(): Promise<string[]> {
    return this.userRoleModelAction.findAdminIds(ADMIN_ROLES);
  }

  private toCreatePayload(
    adminId: string,
    type: AdminNotificationType,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
    sender: AdminNotificationSender,
  ): Partial<AdminNotification> {
    return {
      admin_id: adminId,
      type,
      title: title.slice(0, TITLE_MAX),
      message,
      sender_name: sender.sender_name ? sender.sender_name.slice(0, SENDER_NAME_MAX) : null,
      sender_avatar_url: sender.sender_avatar_url ?? null,
      metadata,
    };
  }

  /**
   * The bulk body must carry exactly one selector: ids OR all: true. Sending both is
   * rejected so a client bug cannot silently widen a targeted request into an
   * admin-wide one. An empty ids array is a valid no-op (FR-8).
   */
  private assertSelection(selection: BulkSelectionDto): void {
    if (selection.all === true && Array.isArray(selection.ids)) {
      throw new BadRequestException(SYS_MSG.ADMIN_NOTIFICATION_BULK_SELECTION_AMBIGUOUS);
    }

    if (selection.all !== true && !Array.isArray(selection.ids)) {
      throw new BadRequestException(SYS_MSG.ADMIN_NOTIFICATION_BULK_SELECTION_REQUIRED);
    }
  }

  private mapToFeedItem(n: AdminNotification): AdminNotificationFeedItem {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      sender_name: n.sender_name,
      sender_avatar_url: n.sender_avatar_url,
      is_read: n.is_read,
      is_starred: n.is_starred,
      read_at: n.read_at,
      metadata: n.metadata ?? {},
      created_at: n.created_at,
    };
  }
}
