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
import { AdminLoginDto } from '../dto/admin-login.dto';

const adminTokenExample = { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' };

export function AdminLoginDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Admin login',
      description:
        'Validates admin credentials and issues a short-lived JWT access token with a `role` claim ' +
        '(`admin` or `super_admin`). Sets the refresh token as an HttpOnly cookie. ' +
        'After 5 consecutive failed attempts the account is locked for 1 hour. ' +
        'Returns the same 401 for wrong password, unknown email, and non-admin accounts — ' +
        'the reason is never revealed.',
    }),
    ApiBody({ type: AdminLoginDto }),
    ApiOkResponse({
      description: 'Login successful — access token issued, refresh token set as HttpOnly cookie',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_LOGIN_SUCCESSFUL,
          data: adminTokenExample,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Invalid credentials — wrong password, unknown email, or account has no admin role',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.ADMIN_INVALID_CREDENTIALS,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.LOCKED,
      description: 'Account locked after 5 consecutive failed login attempts. Lock lifts after 1 hour.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.LOCKED,
          error: 'HttpException',
          message: SYS_MSG.ADMIN_ACCOUNT_LOCKED,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed — missing or malformed fields',
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

export function AdminLogoutDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Admin logout',
      description:
        'Revokes the current admin session: sets `is_revoked = true` on the `user_sessions` row and ' +
        'deletes both Redis session keys, so the access token cannot be used after logout even if ' +
        'it has not yet expired. Clears the `refreshToken` HttpOnly cookie.',
    }),
    ApiOkResponse({
      description: 'Session revoked and refresh cookie cleared',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_LOGOUT_SUCCESSFUL,
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
      description: 'Valid JWT present but token does not carry an admin role claim',
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

export function AdminRefreshTokenDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Refresh admin access token',
      description:
        'Reads the refresh token from the HttpOnly `refreshToken` cookie set at login. ' +
        'Validates the token, re-checks the admin role claim, rotates the refresh token in place, ' +
        'returns a new access token, and resets the cookie. ' +
        'Cannot be tested via Swagger "Try it out" — the browser must send the cookie automatically.',
    }),
    ApiOkResponse({
      description: 'New access token issued and refresh token rotated',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ADMIN_TOKEN_REFRESHED,
          data: adminTokenExample,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Refresh token missing, expired, revoked, or user no longer holds an admin role',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: 'Invalid or expired refresh token',
        },
      },
    }),
  );
}
