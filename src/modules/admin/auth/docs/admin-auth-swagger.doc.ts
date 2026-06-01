import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminLoginDto } from '../dto/admin-login.dto';

export function AdminLoginDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Admin login',
      description:
        'Issues a JWT access token with a role claim and sets the refresh token as an HttpOnly cookie. ' +
        'After 5 consecutive failed attempts the account is locked for 1 hour.',
    }),
    ApiBody({ type: AdminLoginDto }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.ADMIN_LOGIN_SUCCESSFUL,
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_LOGIN_SUCCESSFUL,
          data: { accessToken: 'eyJ...' },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: SYS_MSG.ADMIN_INVALID_CREDENTIALS }),
    ApiResponse({ status: HttpStatus.LOCKED, description: SYS_MSG.ADMIN_ACCOUNT_LOCKED }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
  );
}

export function AdminLogoutDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Admin logout — revokes the current session' }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.ADMIN_LOGOUT_SUCCESSFUL,
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid admin JWT' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: SYS_MSG.ADMIN_ACCESS_DENIED }),
  );
}

export function AdminRefreshTokenDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Refresh admin access token',
      description:
        'Reads the refresh token from the HttpOnly cookie, validates it, re-checks the admin role, ' +
        'and returns a new access token. Cannot be tested via Swagger — requires the HttpOnly cookie.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.ADMIN_TOKEN_REFRESHED,
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_TOKEN_REFRESHED,
          data: { accessToken: 'eyJ...' },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing, expired, or revoked refresh token' }),
  );
}
