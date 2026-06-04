import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import {
  AdminNotificationsControllerDecorators,
  BulkDeleteAdminNotificationsDocs,
  DeleteAdminNotificationDocs,
  ListAdminNotificationsDocs,
  MarkAdminNotificationReadDocs,
  MarkAdminNotificationsUnreadDocs,
  MarkAllAdminNotificationsReadDocs,
  ToggleAdminNotificationStarDocs,
} from '../docs/admin-notifications-swagger.doc';
import { BulkSelectionDto } from '../dto/bulk-selection.dto';
import { ListAdminNotificationsQueryDto } from '../dto/list-admin-notifications.query.dto';
import { ReadAllQueryDto } from '../dto/read-all.query.dto';
import { AdminNotificationsService } from '../services/admin-notifications.service';

// Static segments (read-all, mark-unread, bulk) are declared before the :id routes
// so Nest never matches them as a UUID param.
@AdminNotificationsControllerDecorators()
@Controller('admin/notifications')
@UseGuards(AdminJwtGuard)
export class AdminNotificationsController {
  constructor(private readonly adminNotificationsService: AdminNotificationsService) {}

  @Get()
  @ListAdminNotificationsDocs()
  async listNotifications(@CurrentUser('userId') adminId: string, @Query() query: ListAdminNotificationsQueryDto) {
    const data = await this.adminNotificationsService.getFeed(adminId, query);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATIONS_RETRIEVED,
      data,
    };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @MarkAllAdminNotificationsReadDocs()
  async markAllRead(@CurrentUser('userId') adminId: string, @Query() query: ReadAllQueryDto) {
    const data = await this.adminNotificationsService.markAllRead(adminId, query.type);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATIONS_MARKED_READ,
      data,
    };
  }

  @Patch('mark-unread')
  @HttpCode(HttpStatus.OK)
  @MarkAdminNotificationsUnreadDocs()
  async markUnread(@CurrentUser('userId') adminId: string, @Body() body: BulkSelectionDto) {
    const data = await this.adminNotificationsService.markUnread(adminId, body);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATIONS_MARKED_UNREAD,
      data,
    };
  }

  @Delete('bulk')
  @HttpCode(HttpStatus.OK)
  @BulkDeleteAdminNotificationsDocs()
  async bulkDelete(@CurrentUser('userId') adminId: string, @Body() body: BulkSelectionDto) {
    const data = await this.adminNotificationsService.bulkDelete(adminId, body);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATIONS_BULK_DELETED,
      data,
    };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @MarkAdminNotificationReadDocs()
  async markRead(@CurrentUser('userId') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminNotificationsService.markRead(adminId, id);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATION_MARKED_READ,
      data,
    };
  }

  @Patch(':id/star')
  @HttpCode(HttpStatus.OK)
  @ToggleAdminNotificationStarDocs()
  async toggleStar(@CurrentUser('userId') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminNotificationsService.toggleStar(adminId, id);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATION_STAR_TOGGLED,
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @DeleteAdminNotificationDocs()
  async deleteNotification(@CurrentUser('userId') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.adminNotificationsService.deleteOne(adminId, id);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATION_DELETED,
      data: null,
    };
  }
}
