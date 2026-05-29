import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { NotificationFilter } from '../enums/notification-filter.enum';

const notificationItemExample = {
  id: '550e8400-e29b-41d4-a716-446655440111',
  type: 'funnel_completed',
  title: 'Your funnel is ready',
  body: 'Your funnel generation has finished and the new funnel is ready to view.',
  is_read: false,
  read_at: null,
  metadata: {
    funnelId: '550e8400-e29b-41d4-a716-446655440001',
    stageId: '550e8400-e29b-41d4-a716-446655440002',
  },
  created_at: '2026-05-28T10:00:00.000Z',
};

const notificationFeedExample = {
  items: [notificationItemExample],
  total_count: 1,
  unread_count: 1,
  page: 1,
  per_page: 20,
  has_next: false,
};

const notificationCountExample = { count: 1 };
const notificationUpdateExample = { updated_count: 1 };

const unauthorizedExample = {
  success: false,
  statusCode: HttpStatus.UNAUTHORIZED,
  error: 'UnauthorizedException',
  message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
};

const notFoundExample = {
  success: false,
  statusCode: HttpStatus.NOT_FOUND,
  error: 'NotFoundException',
  message: SYS_MSG.NOTIFICATION_NOT_FOUND,
};

export function NotificationsControllerDecorators() {
  return applyDecorators(ApiTags('notifications'), ApiBearerAuth('JWT'));
}

export const ListNotificationsDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get the authenticated user notification feed',
      description:
        'Returns the current user notification feed, newest first, with server-side pagination. ' +
        'The unread_count is always the total unread notifications for the user, regardless of the active filter tab. ' +
        'The per_page value is capped at 50 even when a larger value is provided.',
    }),
    ApiQuery({ name: 'filter', required: false, enum: NotificationFilter, example: NotificationFilter.ALL }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'per_page', required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: 'Paginated notification feed',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.NOTIFICATIONS_RETRIEVED_SUCCESSFULLY,
          data: notificationFeedExample,
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  );

export const GetUnreadCountDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get the authenticated user unread notification count',
      description:
        'Returns the total unread count for the authenticated user. ' +
        'This endpoint powers the bell badge and is safe to poll at a short interval.',
    }),
    ApiOkResponse({
      description: 'Unread count retrieved successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.NOTIFICATION_UNREAD_COUNT_RETRIEVED,
          data: notificationCountExample,
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  );

export const MarkNotificationReadDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Mark one notification as read',
      description:
        'Marks a single notification as read for the current user. ' +
        'The notification must belong to the authenticated user; otherwise the API returns 404. ' +
        'If it is already read, the request is idempotent and returns the current notification state.',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Notification UUID' }),
    ApiOkResponse({
      description: 'Notification marked as read',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.NOTIFICATION_MARKED_AS_READ,
           data: {
            ...notificationItemExample,
            is_read: true,
            read_at: '2026-05-29T10:00:00.000Z',
         },
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Notification not found or not owned by the current user.', schema: { example: notFoundExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  );

export const MarkAllNotificationsReadDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Mark all notifications as read',
      description:
        'Bulk-updates all unread notifications for the current user using a single scoped UPDATE statement. ' +
        'If every notification is already read, the endpoint returns updated_count = 0 without writing to the database.',
    }),
    ApiOkResponse({
      description: 'Notifications marked as read',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.NOTIFICATIONS_MARKED_AS_READ,
          data: notificationUpdateExample,
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  );

export const MarkAllNotificationsUnreadDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Mark all notifications as unread',
      description:
        'Bulk-updates all read notifications for the current user using a single scoped UPDATE statement. ' +
        'Notifications that are already unread are ignored.',
    }),
    ApiOkResponse({
      description: 'Notifications marked as unread',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.NOTIFICATIONS_MARKED_AS_UNREAD,
          data: notificationUpdateExample,
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  );

export const DeleteNotificationDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Delete one notification',
      description:
        'Hard-deletes a single notification owned by the current user. ' +
        'If the notification belongs to another user or has already been deleted, the API returns 404.',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Notification UUID' }),
    ApiOkResponse({
      description: 'Notification deleted',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.NOTIFICATION_DELETED,
          data: null,
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Notification not found or not owned by the current user.', schema: { example: notFoundExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  );