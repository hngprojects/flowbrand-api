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
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
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
        'Issues a JWT access token and sets the refresh token as an HttpOnly cookie.\
        After 5 consecutive failed attempts the account is locked for 1 hour.',
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
        'Account locked after 5 consecutive failed login attempts. The lock lifts 1 \
        hour after the lockout was triggered.',
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
        'Reads the refresh token from the request body, or falls back to the HttpOnly \
        `refreshToken` cookie set on login when the body field is omitted. Validates the \
        token, rotates it in place on the existing session, returns a new access token, and \
        resets the cookie. Both first-party clients (browser cookie) and external clients\
         (explicit body) are supported.',
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
        'Sets `is_revoked = true` on the active `user_sessions` row and deletes the \
        matching `sess:{userId}:{sessionId}` key in Redis, so neither the refresh \
        token nor the still-unexpired access token can be used after logout.',
    }),
  );

export const MeDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({ summary: 'Return the current authenticated user' }),
  );

export const SendOtpDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: "Send OTP verification code to the user's registered email",
      description:
        'Generates a 6-digit OTP, hashes it, stores it in otp_tokens, and enqueues a verification email. ' +
        'Rate limited to 5 requests per 15 minutes per user. ' +
        'Returns 200 for unknown emails to prevent enumeration. ' +
        'Already-verified accounts also return 200 with a distinct message.',
    }),
    ApiBody({ type: SendOtpDto }),
    ApiOkResponse({
      description:
        'OTP dispatched, email not found, or account already verified — all return 200 to prevent enumeration',
      schema: {
        example: {
          statusCode: 200,
          message: 'OTP sent successfully',
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description:
        'Rate limit exceeded — max 5 OTP requests per 15 minutes per user',
      schema: {
        example: {
          statusCode: 429,
          message: 'Too many OTP requests. Please try again later.',
          error: 'HttpException',
        },
      },
    }),
  );

export const VerifyOtpDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Verify the OTP code and activate the account',
      description:
        'Validates the 6-digit OTP against the stored hash. On success the token is deleted, ' +
        'the account is marked verified, and a JWT access token + HttpOnly refresh cookie are issued. ' +
        'The token is single-use — submitting it a second time returns 400.',
    }),
    ApiBody({ type: VerifyOtpDto }),
    ApiOkResponse({
      description: 'OTP verified, account activated, tokens issued',
      schema: {
        example: {
          statusCode: 200,
          message: SYS_MSG.OTP_VERIFIED_SUCCESSFULLY,
          data: authResponseExample,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'OTP is invalid, already used, or expired',
      schema: {
        example: {
          statusCode: 400,
          message: SYS_MSG.OTP_INVALID,
          error: 'BadRequestException',
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'Account is already verified',
      schema: {
        example: {
          statusCode: 409,
          message: SYS_MSG.ACCOUNT_ALREADY_VERIFIED,
          error: 'ConflictException',
        },
      },
    }),
  );

export const ResendOtpDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Resend a fresh OTP verification code',
      description:
        'Invalidates any existing OTP, generates a new one, and sends it. ' +
        'Enforces a 30-second per-request cooldown and a max of 10 resend requests per hour. ' +
        'Returns 200 for unknown emails and already-verified accounts to prevent enumeration.',
    }),
    ApiBody({ type: ResendOtpDto }),
    ApiOkResponse({
      description: 'OTP sent, email not found, or account already verified — all return 200',
      schema: {
        example: {
          statusCode: 200,
          message: SYS_MSG.OTP_RESENT_SUCCESSFULLY,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description:
        '30-second cooldown active (`retryAfter` = seconds remaining) ' +
        'or hourly limit reached (`retryAfter` = 3600)',
      schema: {
        example: {
          statusCode: 429,
          message: SYS_MSG.OTP_RESEND_RATE_LIMITED,
          retryAfter: 18,
        },
      },
    }),
  );
