import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { UpdateAdminProfileDto } from '../dto/update-admin-profile.dto';

const profileExample = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  full_name: 'Jane Admin',
  email: 'admin@example.com',
  country: 'Nigeria',
  avatar_url: null,
  role: 'admin',
  created_at: '2026-05-29T10:30:00.000Z',
};

export function GetAdminProfileDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get authenticated admin profile',
      description:
        'Returns the current authenticated admin profile details for the Settings > My Profile tab. ' +
        'Response includes role and excludes sensitive fields such as password_hash. ' +
        'If profile-role lookup is unavailable, the endpoint falls back to the authenticated JWT role so the read never fails after a committed write.',
    }),
    ApiOkResponse({
      description: 'Admin profile retrieved successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_PROFILE_RETRIEVED_SUCCESSFULLY,
          data: profileExample,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Authenticated but role is not admin/super_admin',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.ADMIN_ACCESS_DENIED,
        },
      },
    }),
  );
}

export function UpdateAdminProfileDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Update authenticated admin profile',
      description:
        'Accepts partial updates for full_name and country only. ' +
        'Email is read-only and returns HTTP 422 when provided. ' +
        'Empty request body or unchanged values return HTTP 200 with no DB write. ' +
        'If role lookup fails after a successful update, the endpoint falls back to the authenticated JWT role instead of returning a 500.',
    }),
    ApiBody({ type: UpdateAdminProfileDto }),
    ApiOkResponse({
      description: 'Admin profile updated successfully (or unchanged/no-op)',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_PROFILE_UPDATED_SUCCESSFULLY,
          data: profileExample,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Validation failed (full_name/country)',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.VALIDATION_FAILED,
          details: [
            { field: 'full_name', message: 'full_name must be longer than or equal to 2 characters' },
            { field: 'country', message: 'country must be one of the allowed SSA countries' },
          ],
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Email change forbidden',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.ADMIN_PROFILE_EMAIL_CHANGE_FORBIDDEN,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Authenticated but role is not admin/super_admin',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.ADMIN_ACCESS_DENIED,
        },
      },
    }),
  );
}
