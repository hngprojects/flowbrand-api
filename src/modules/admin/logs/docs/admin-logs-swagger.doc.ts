import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';

export function GetAdminLogsDocs(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'List platform activity logs',
      description:
        'Returns the paginated audit trail of user and system activity, newest first. ' +
        'Filter by action_type, status and created_at date range; search matches the ' +
        'acting user by full_name or email. Entries whose user was deleted display ' +
        '`Deleted User` with a null email. `location` is derived from `ip_address` ' +
        '(format `Region, CC`) and `device` is parsed from the captured user agent ' +
        '(format `Browser Major · OS Version`); either is null when it cannot be ' +
        'resolved. per_page values above 50 are silently capped and flagged via ' +
        '`meta.capped`. Requires a valid admin JWT.',
    }),
    ApiOkResponse({
      description: 'Logs retrieved successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_LOGS_RETRIEVED,
          data: {
            data: [
              {
                id: 'b7e6a1c0-3f2d-4e8a-9c5b-1d2e3f4a5b6c',
                user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                user_name: 'John Doe',
                user_email: 'john@example.com',
                action_type: 'login',
                description: 'User logged in',
                ip_address: '102.89.33.21',
                location: 'Lagos, NG',
                device: 'Chrome 134 · macOS 10.15.7',
                created_at: '2026-06-06T09:15:00.000Z',
                status: 'success',
              },
              {
                id: 'c8f7b2d1-4a3e-5f9b-8d6c-2e3f4a5b6c7d',
                user_id: null,
                user_name: 'Deleted User',
                user_email: null,
                action_type: 'account_deleted',
                description: 'User deleted their account',
                ip_address: '102.89.33.22',
                location: 'Abuja, NG',
                device: 'Safari 17 · iOS 17.1',
                created_at: '2026-06-05T18:42:00.000Z',
                status: 'success',
              },
            ],
            meta: { total: 2, page: 1, per_page: 20, has_next: false },
          },
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid admin JWT',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: 'Unauthenticated',
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'JWT present but the user has no admin role',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.ADMIN_ACCESS_DENIED,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed: unknown action_type or status, malformed date, or page below 1',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequestException',
          message: 'Validation failed',
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'date_from is after date_to',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.ADMIN_LOGS_INVALID_DATE_RANGE,
        },
      },
    }),
  );
}
