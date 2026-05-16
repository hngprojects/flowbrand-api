import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

const authUserExample = {
  id: 'uuid',
  email: 'user@example.com',
  full_name: 'Jane Doe',
};

const authResponseExample = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  user: authUserExample,
  redirectUrl: '/dashboard',
};

export const RegisterDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Register a new user' }),
    ApiCreatedResponse({
      description: 'User registered and logged in',
      schema: {
        example: {
          statusCode: 201,
          message: 'User Created Successfully',
          data: authResponseExample,
        },
      },
    }),
  );

export const LoginDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Log in with email and password',
      description:
        'Issues a JWT access token and sets the refresh token as an HttpOnly cookie. After 5 consecutive failed attempts the account is locked for 1 hour.',
    }),
    ApiOkResponse({
      description: 'Login successful',
      schema: {
        example: {
          statusCode: 200,
          message: SYS_MSG.AUTH_LOGIN_SUCCESSFUL,
          data: authResponseExample,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Invalid email or password',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.AUTH_INVALID_CREDENTIALS,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.LOCKED,
      description:
        'Account locked after 5 consecutive failed login attempts. The lock lifts 1 hour after the lockout was triggered.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.LOCKED,
          error: 'HttpException',
          message: SYS_MSG.AUTH_ACCOUNT_LOCKED,
        },
      },
    }),
  );

export const RefreshDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Rotate the refresh token for a new access token',
      description:
        'Reads the refresh token from the request body, or falls back to the HttpOnly `refreshToken` cookie set on login when omitted. Validates and rotates the token in place.',
    }),
    ApiOkResponse({
      description: 'Refresh token rotated and new access token issued',
      schema: {
        example: {
          statusCode: 200,
          message: SYS_MSG.AUTH_TOKEN_REFRESHED,
          data: authResponseExample,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Refresh token is invalid, expired, or already revoked',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.AUTH_INVALID_REFRESH_TOKEN,
        },
      },
    }),
  );

export const LogoutDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Revoke the current session',
      description:
        'Sets `is_revoked = true` on the active `user_sessions` row and deletes the matching `sess:{userId}:{sessionId}` key in Redis, invalidating the active session.',
    }),
  );

export const MeDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({ summary: 'Return the current authenticated user' }),
  );

export const GoogleAuthDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Redirect to Google for OAuth login' }),
    ApiResponse({
      status: HttpStatus.FOUND,
      description: 'Redirect to Google OAuth consent screen',
    }),
  );

export const GoogleCallbackDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Handle Google OAuth callback' }),
    ApiOkResponse({
      description: 'Successful OAuth login; returns access token in redirect and sets refresh cookie',
      schema: {
        example: {
          statusCode: 200,
          message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
          access_token: 'jwt.access.token',
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'OAuth failed or no email provided by Google',
      schema: {
        example: {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: SYS_MSG.GOOGLE_ACCOUNT_NO_EMAIL,
        },
      },
    }),
  );
