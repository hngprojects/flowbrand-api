import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { CreateAdminDto } from '../dto/create-admin.dto';

export function CreateAdminDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Create an admin or super-admin account',
      description:
        'Creates a new user and assigns the specified role (`admin` or `super_admin`). ' +
        'Requires a `super_admin`-scoped JWT — a regular `admin` token returns 403. ' +
        'The response never includes the created user object; only a success message is returned.',
    }),
    ApiBody({ type: CreateAdminDto }),
    ApiCreatedResponse({
      description: 'Admin account created successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY,
          data: null,
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
      description: 'JWT present but role is `admin` — only `super_admin` can create new admins',
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
      status: HttpStatus.CONFLICT,
      description: 'Email address is already registered',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          error: 'ConflictException',
          message: SYS_MSG.ADMIN_EMAIL_CONFLICT,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed — missing fields, weak password, or invalid role value',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequestException',
          message: 'Validation failed',
        },
      },
    }),
  );
}

export function GetAdminUsersDocs(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'List platform users',
      description:
        'Returns a paginated, filterable list of all non-deleted platform users. ' +
        'Filter by status (`active` = last login within 30 days, `inactive` = older or never). ' +
        'Supports partial-match search on email and full_name. ' +
        'Requires a valid admin JWT.',
    }),
    ApiOkResponse({
      description: 'Users retrieved successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_USERS_LIST_RETRIEVED,
          data: {
            data: [
              {
                id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                full_name: 'Jane Doe',
                email: 'jane@example.com',
                plan: 'free',
                status: 'active',
                created_at: '2024-01-15T10:00:00.000Z',
                last_active_at: '2024-06-01T08:30:00.000Z',
                funnel_count: 3,
              },
            ],
            meta: {
              total: 120,
              page: 1,
              per_page: 20,
              has_next: true,
            },
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
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid query parameter — unknown enum value for status or sortBy, non-integer or negative value for page or perPage. Note: perPage values above 50 are silently capped, not rejected.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequestException',
          message: 'Validation failed',
        },
      },
    }),
  );
}
