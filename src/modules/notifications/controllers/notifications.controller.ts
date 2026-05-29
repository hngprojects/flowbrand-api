import { Controller, Delete, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { ListNotificationsQueryDto } from '../dto/list-notifications.query.dto';
import { NotificationFilter } from '../enums/notification-filter.enum';
import { NotificationsService } from '../notifications.service';
import { NotificationFeedItem } from '../interfaces/notification-feed.interface';
import {
  DeleteNotificationDocs,
  GetUnreadCountDocs,
  ListNotificationsDocs,
  MarkAllNotificationsReadDocs,
  MarkAllNotificationsUnreadDocs,
  MarkNotificationReadDocs,
  NotificationsControllerDecorators,
} from '../docs/notifications-swagger.doc';

@NotificationsControllerDecorators()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ListNotificationsDocs()
  async listNotifications(@CurrentUser('userId') userId: string, @Query() query: ListNotificationsQueryDto) {
    const filter = query?.filter ?? NotificationFilter.ALL;
    const page = query?.page ?? 1;
    const perPage = query?.per_page ?? 20;
    const data = await this.notificationsService.getFeed(userId, filter, page, perPage);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATIONS_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @Get('unread-count')
  @GetUnreadCountDocs()
  async unreadCount(@CurrentUser('userId') userId: string) {
    const data = await this.notificationsService.getUnreadCount(userId);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATION_UNREAD_COUNT_RETRIEVED,
      data,
    };
  }

  @Patch(':id/read')
  @MarkNotificationReadDocs()
  async markAsRead(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const n = await this.notificationsService.markRead(userId, id);

    const data: NotificationFeedItem = {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      is_read: n.is_read,
      read_at: n.read_at,
      metadata: n.metadata ?? {},
      created_at: n.created_at,
    };

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATION_MARKED_AS_READ,
      data,
    };
  }

  @Patch('read-all')
  @MarkAllNotificationsReadDocs()
  async markAllAsRead(@CurrentUser('userId') userId: string) {
    const data = await this.notificationsService.markAllAsRead(userId);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATIONS_MARKED_AS_READ,
      data,
    };
  }

  @Patch('mark-all-unread')
  @MarkAllNotificationsUnreadDocs()
  async markAllAsUnread(@CurrentUser('userId') userId: string) {
    const data = await this.notificationsService.markAllAsUnread(userId);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATIONS_MARKED_AS_UNREAD,
      data,
    };
  }

  @Delete(':id')
  @DeleteNotificationDocs()
  async deleteNotification(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.notificationsService.deleteNotification(userId, id);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATION_DELETED,
      data: null,
    };
  }
}