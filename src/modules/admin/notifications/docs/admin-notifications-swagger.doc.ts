import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import {
  AdminNotificationReadFilter,
  AdminNotificationType,
  AdminNotificationTypeFilter,
} from '../enums/admin-notification.enum';

const notificationItemExample = {
  id: '550e8400-e29b-41d4-a716-446655440111',
  type: AdminNotificationType.MILESTONE,
  title: 'Stage milestone reached',
  message: 'Ada Obi completed the "Build Awareness" stage',
  sender_name: 'Ada Obi',
  sender_avatar_url: 'https://cdn.example.com/avatars/ada.png',
  is_read: false,
  is_starred: false,
  read_at: null,
  metadata: {
    user_id: '550e8400-e29b-41d4-a716-446655440001',
    funnel_id: '550e8400-e29b-41d4-a716-446655440002',
    stage_id: '550e8400-e29b-41d4-a716-446655440003',
  },
  created_at: '2026-06-01T10:00:00.000Z',
};

const feedExample = {
  data: [notificationItemExample],
  meta: { total: 1, unread_count: 1, page: 1, per_page: 20, has_next: false },
};

const updateCountExample = { updated_count: 3 };
const deleteCountExample = { deleted_count: 2 };

const unauthorizedExample = {
  success: false,
  statusCode: HttpStatus.UNAUTHORIZED,
  error: 'UnauthorizedException',
  message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
};

const forbiddenExample = {
  success: false,
  statusCode: HttpStatus.FORBIDDEN,
  error: 'ForbiddenException',
  message: SYS_MSG.ADMIN_ACCESS_DENIED,
};

const notFoundExample = {
  success: false,
  statusCode: HttpStatus.NOT_FOUND,
  error: 'NotFoundException',
  message: SYS_MSG.ADMIN_NOTIFICATION_NOT_FOUND,
};

const badSelectionExample = {
  success: false,
  statusCode: HttpStatus.BAD_REQUEST,
  error: 'BadRequestException',
  message: SYS_MSG.ADMIN_NOTIFICATION_BULK_SELECTION_REQUIRED,
};

const bulkSelectionBody = {
  description:
    'Provide exactly one selector: an ids array OR all: true. Sending both is rejected with 400. ' +
    'An empty ids array is accepted as a no-op.',
  schema: {
    oneOf: [
      {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } } },
        required: ['ids'],
      },
      {
        type: 'object',
        properties: { all: { type: 'boolean', enum: [true] } },
        required: ['all'],
      },
    ],
    example: { ids: [notificationItemExample.id] },
  },
};

const commonAuthResponses = [
  ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
  ApiForbiddenResponse({ description: 'Authenticated user is not an admin.', schema: { example: forbiddenExample } }),
];

export function AdminNotificationsControllerDecorators() {
  return applyDecorators(ApiTags('Admin Notifications'), ApiBearerAuth('JWT'));
}

export const ListAdminNotificationsDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get the admin notification feed',
      description:
        'Returns the authenticated admin notification feed, newest first, with server-side pagination. ' +
        'Supports the portal filter tabs via type, read and starred query params. ' +
        'meta.unread_count is always the total unread count regardless of the active filter. ' +
        'per_page is capped at 50. An empty feed returns 200 with an empty data array, never 404.',
    }),
    ApiQuery({ name: 'type', required: false, enum: AdminNotificationTypeFilter, example: AdminNotificationTypeFilter.ALL }),
    ApiQuery({ name: 'read', required: false, enum: AdminNotificationReadFilter, example: AdminNotificationReadFilter.ALL }),
    ApiQuery({ name: 'starred', required: false, type: Boolean, example: true }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'per_page', required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: 'Paginated admin notification feed',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATIONS_RETRIEVED,
          data: feedExample,
        },
      },
    }),
    ...commonAuthResponses,
  );

export const MarkAdminNotificationReadDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Mark one admin notification as read',
      description:
        'Marks a single notification as read and stamps read_at. ' +
        'The notification must belong to the authenticated admin; otherwise the API returns 404. ' +
        'Already-read notifications are returned unchanged (idempotent).',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Notification UUID' }),
    ApiOkResponse({
      description: 'Notification marked as read',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATION_MARKED_READ,
          data: { ...notificationItemExample, is_read: true, read_at: '2026-06-02T08:00:00.000Z' },
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Notification not found or not owned by this admin.', schema: { example: notFoundExample } }),
    ...commonAuthResponses,
  );

export const MarkAllAdminNotificationsReadDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Mark all admin notifications as read',
      description:
        'Marks all unread notifications for the authenticated admin as read in a single scoped UPDATE. ' +
        'An optional type query param restricts the update to one notification type. ' +
        'If everything is already read the endpoint is a no-op and still returns 200 with updated_count = 0.',
    }),
    ApiQuery({ name: 'type', required: false, enum: AdminNotificationType }),
    ApiOkResponse({
      description: 'Notifications marked as read',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATIONS_MARKED_READ,
          data: updateCountExample,
        },
      },
    }),
    ...commonAuthResponses,
  );

export const MarkAdminNotificationsUnreadDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Mark selected admin notifications as unread',
      description:
        'Marks the selected notifications (or all with all: true) as unread for the authenticated admin. ' +
        'Ids that do not belong to the admin are ignored. An empty ids array returns 200 as a no-op.',
    }),
    ApiBody(bulkSelectionBody),
    ApiOkResponse({
      description: 'Notifications marked as unread',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATIONS_MARKED_UNREAD,
          data: updateCountExample,
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Neither ids nor all: true was provided.', schema: { example: badSelectionExample } }),
    ...commonAuthResponses,
  );

export const DeleteAdminNotificationDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Delete one admin notification',
      description:
        'Hard-deletes a single notification owned by the authenticated admin. ' +
        'If the notification belongs to another admin or does not exist, the API returns 404.',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Notification UUID' }),
    ApiOkResponse({
      description: 'Notification deleted',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATION_DELETED,
          data: null,
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Notification not found or not owned by this admin.', schema: { example: notFoundExample } }),
    ...commonAuthResponses,
  );

export const BulkDeleteAdminNotificationsDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Bulk delete admin notifications',
      description:
        'Hard-deletes the selected notifications (or all with all: true) for the authenticated admin. ' +
        'Ids owned by other admins are filtered out and never deleted; no error is raised for non-owned ids.',
    }),
    ApiBody(bulkSelectionBody),
    ApiOkResponse({
      description: 'Notifications deleted',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATIONS_BULK_DELETED,
          data: deleteCountExample,
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Neither ids nor all: true was provided.', schema: { example: badSelectionExample } }),
    ...commonAuthResponses,
  );

export const ToggleAdminNotificationStarDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Toggle the star on one admin notification',
      description:
        'Toggles is_starred for a notification owned by the authenticated admin and returns the updated notification. ' +
        'Calling the endpoint twice returns the notification to its original state.',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Notification UUID' }),
    ApiOkResponse({
      description: 'Star toggled',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_NOTIFICATION_STAR_TOGGLED,
          data: { ...notificationItemExample, is_starred: true },
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Notification not found or not owned by this admin.', schema: { example: notFoundExample } }),
    ...commonAuthResponses,
  );
