import { INestApplication, applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  DocumentBuilder,
  SwaggerModule,
  ApiBadRequestResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import * as SYS_MSG from '../../../constants/system.messages';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { VerifyResetOtpDto } from '../dto/verify-reset-otp.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { GoogleExchangeDto } from '../dto/google-exchange.dto';

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
      description: 'User registered — OTP verification email sent',
      schema: {
        example: {
          success: true,
          statusCode: 201,
          message: SYS_MSG.REGISTRATION_SUCCESSFUL_VERIFY_EMAIL,
          data: null,
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
          success: true,
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
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Email is unverified. Please verify your email via OTP before logging in.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.AUTH_EMAIL_UNVERIFIED,
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
          success: true,
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
        token nor the still-unexpired access token can be used after logout. \
        Clears the `refreshToken` HttpOnly cookie.',
    }),
    ApiOkResponse({
      description: 'Session revoked and refresh cookie cleared',
      schema: {
        example: {
          success: true,
          statusCode: 200,
          message: SYS_MSG.AUTH_LOGOUT_SUCCESSFUL,
          data: null,
        },
      },
    }),
  );

export const MeDocs = () =>
  applyDecorators(ApiBearerAuth('JWT'), ApiOperation({ summary: 'Return the current authenticated user' }));

export const GoogleAuthDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Redirect to Google for OAuth login' }),
    ApiResponse({
      status: HttpStatus.FOUND,
      description: 'Redirect to Google OAuth consent screen',
      schema: {
        example: {
          status_code: HttpStatus.FOUND,
          message: 'Redirect to Google OAuth consent screen',
        },
      },
    }),
  );

export const GoogleCallbackDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Handle Google OAuth callback' }),
    ApiResponse({
      status: HttpStatus.FOUND,
      description: 'Redirects to client after successful OAuth with a short-lived exchange code query parameter',
    }),
    ApiUnauthorizedResponse({
      description: 'Google OAuth failed or no email was provided',
      schema: {
        example: {
          success: false,
          status_code: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.GOOGLE_OAUTH_FAILED,
        },
      },
    }),
  );

export const GoogleExchangeDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Exchange short-lived Google OAuth code for user session and tokens',
      description:
        'Validates the short-lived single-use exchange code from Redis, consumes it (deletes it), ' +
        'sets the refresh token as an HttpOnly cookie, and returns the access token + user details.',
    }),
    ApiBody({ type: GoogleExchangeDto }),
    ApiOkResponse({
      description: 'Exchange successful — session created, refresh cookie set, and tokens issued',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
          data: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: {
              id: 'user-uuid-xyz',
              email: 'user@example.com',
              fullName: 'Jane Doe',
              avatarUrl: 'https://example.com/avatar.png',
            },
            redirectUrl: '/dashboard',
          },
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Exchange code is invalid or expired',
      schema: {
        example: {
          statusCode: HttpStatus.BAD_REQUEST,
          message: SYS_MSG.GOOGLE_EXCHANGE_CODE_INVALID,
          error: 'BadRequestException',
        },
      },
    }),
  );

export const SendOtpDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: '[Internal] Send OTP — use resend-otp for frontend retry flows',
      description:
        '**Internal use only.** `POST /auth/register` calls this automatically — ' +
        'the frontend should never need to call it directly. ' +
        'For user-facing retry UI (e.g. "Resend code" button), use `POST /auth/resend-otp` instead, ' +
        'which enforces a 30-second cooldown and hourly cap designed for user-initiated retries.\n\n' +
        'Generates a 6-digit OTP, hashes it, stores it in otp_tokens, and enqueues a verification email. ' +
        'Rate limited to 5 requests per 15 minutes per user. ' +
        'Returns 200 for unknown emails to prevent enumeration. ' +
        'Already-verified accounts also return 200.',
    }),
    ApiBody({ type: SendOtpDto }),
    ApiOkResponse({
      description:
        'OTP dispatched, email not found, or account already verified — all return 200 to prevent enumeration',
      schema: {
        example: {
          success: true,
          statusCode: 200,
          message: SYS_MSG.OTP_SENT_SUCCESSFULLY,
          data: null,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: 'Rate limit exceeded — max 5 OTP requests per 15 minutes per user',
      schema: {
        example: {
          statusCode: 429,
          message: 'Too many OTP requests. Please try again later.',
          error: 'HttpException',
        },
      },
    }),
  );

const SWAGGER_OAUTH_REDIRECT_SCRIPT_PATH = '/swagger-oauth-redirect.js';

function registerSwaggerOAuthRedirectScript(app: INestApplication): void {
  app.use(SWAGGER_OAUTH_REDIRECT_SCRIPT_PATH, (_req: Request, res: Response) => {
    // Inject a FRONTEND_BASE value from server config so the client-side mock redirects to the real frontend.
    const frontendBase = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');

    res.type('application/javascript').send(`
      (() => {
        const FRONTEND_BASE = '${frontendBase}';
        const originalFetch = window.fetch.bind(window);

        function getStoredJwt() {
          try {
            const auth = localStorage.getItem('authorized');
            if (!auth) return null;
            const parsed = JSON.parse(auth);
            if (parsed && parsed.JWT && parsed.JWT.value) return parsed.JWT.value;
            return null;
          } catch (error) {
            return null;
          }
        }

        window.fetch = (input, init) => {
          try {
            const token = getStoredJwt();
            let url = '';
            try {
              if (typeof input === 'string') url = input;
              else if (input && input.url) url = input.url;
            } catch (e) {
              url = '';
            }

            let target = null;
            try {
              target = new URL(url, window.location.href);
            } catch (e) {
              target = null;
            }

            // Only attach Authorization to same-origin API calls
            if (token && target && target.origin === window.location.origin && target.pathname.startsWith('/api/')) {
              const originalHeaders = (init && init.headers) || (input && input.headers) || {};
              const headers = new Headers(originalHeaders);

              if (!headers.has('Authorization')) {
                headers.set('Authorization', 'Bearer ' + token);
              }

              if (typeof input === 'string') {
                return originalFetch(target.toString(), Object.assign({}, init || {}, { headers }));
              }

              try {
                const request = new Request(target.toString(), Object.assign({}, init || {}, { headers }));
                return originalFetch(request);
              } catch (error) {
                return originalFetch(input, init);
              }
            }

            // Only handle OAuth mock redirects for same-origin GETs & POSTs
            const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (target && target.origin === window.location.origin) {
              if (method === 'GET') {
                if (target.pathname.includes('/auth/google/callback')) {
                  const callbackRedirectUrl = FRONTEND_BASE + '/onboarding?code=mock-exchange-code-123';
                  return Promise.resolve(Response.redirect(callbackRedirectUrl, 302));
                }

                if (target.pathname.includes('/auth/google')) {
                  return Promise.resolve(
                    new Response('Redirect to Google OAuth consent screen', {
                      status: 302,
                      statusText: 'Redirect to Google OAuth consent screen',
                      headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        Location: '/auth/google/callback',
                      },
                    }),
                  );
                }
              } else if (method === 'POST') {
                if (target.pathname.includes('/auth/google/exchange')) {
                  const responsePayload = {
                    statusCode: 200,
                    message: 'OAuth login successful',
                    data: {
                      accessToken: 'mock.access.token',
                      user: {
                        id: 'mock-user-id',
                        email: 'mock@example.com',
                        fullName: 'Mock Google User',
                        avatarUrl: null
                      },
                      redirectUrl: '/dashboard'
                    }
                  };
                  return Promise.resolve(new Response(JSON.stringify(responsePayload), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                  }));
                }
              }
            }
          } catch (error) {
            // Fall through to the original fetch implementation.
          }

          return originalFetch(input, init);
        };
      })();
    `);
  });
}

export function setupSwagger(app: INestApplication): void {
  const enableSwaggerMocks = process.env.NODE_ENV !== 'production';

  if (enableSwaggerMocks) {
    registerSwaggerOAuthRedirectScript(app);
  }

  const config = new DocumentBuilder()
    .setTitle('SEIL API')
    .setDescription('SEIL REST API documentation')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    customJs: enableSwaggerMocks ? SWAGGER_OAUTH_REDIRECT_SCRIPT_PATH : undefined,
    swaggerOptions: { persistAuthorization: true, 
      tagsSorter: 'alpha',
      operationsSorter: 'alpha' },
  });
}
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
          success: true,
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
          success: true,
          statusCode: 200,
          message: SYS_MSG.OTP_RESENT_SUCCESSFULLY,
          data: null,
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

export const ForgotPasswordDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Request password reset OTP',
      description:
        "Generates a 6-digit OTP, stores it with 15-minute expiry, and sends it to the user's email. " +
        'Rate limited to 3 requests per 15 minutes per user. ' +
        'Returns 200 for unknown emails to prevent enumeration. ' +
        'Only verified accounts can request password reset.',
    }),
    ApiBody({ type: ForgotPasswordDto }),
    ApiOkResponse({
      description: 'OTP sent if email exists (always returns 200 to prevent enumeration)',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
          data: null,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: 'Rate limit exceeded — max 3 OTP requests per 15 minutes per user',
      schema: {
        example: {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: SYS_MSG.PASSWORD_RESET_RATE_LIMITED,
        },
      },
    }),
  );

export const VerifyResetOtpDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Verify password reset OTP',
      description:
        'Validates the 6-digit OTP sent to the email. On success: OTP is deleted and a short-lived ' +
        'reset token (JWT, 15 min) is returned. Pass this token to POST /auth/reset-password. ' +
        'Rate limited to 5 attempts per 5 minutes.',
    }),
    ApiBody({ type: VerifyResetOtpDto }),
    ApiOkResponse({
      description: 'OTP verified — reset token issued',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PASSWORD_RESET_OTP_VERIFIED,
          data: { reset_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Invalid or expired OTP',
      schema: {
        example: {
          statusCode: HttpStatus.BAD_REQUEST,
          message: SYS_MSG.PASSWORD_RESET_INVALID_OTP,
        },
      },
    }),
    ApiTooManyRequestsResponse({
      description: 'Too many verification attempts (max 5 per 5 minutes)',
      schema: {
        example: {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: SYS_MSG.PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED,
        },
      },
    }),
  );

export const ResetPasswordDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Reset password using reset token and auto-login',
      description:
        'Verifies the short-lived reset token issued by POST /auth/verify-reset-otp. On success: ' +
        '1) Password is updated, 2) All existing sessions are revoked, ' +
        '3) User is automatically logged in with new access/refresh tokens.',
    }),
    ApiBody({ type: ResetPasswordDto }),
    ApiOkResponse({
      description: 'Password reset successful — user auto-logged in and refresh cookie set',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PASSWORD_RESET_SUCCESSFUL,
          data: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: {
              id: 'uuid',
              email: 'user@example.com',
              full_name: 'Jane Doe',
            },
            redirectUrl: '/dashboard',
          },
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Invalid or expired reset token',
      schema: {
        example: {
          statusCode: HttpStatus.BAD_REQUEST,
          message: SYS_MSG.PASSWORD_RESET_INVALID_TOKEN,
        },
      },
    }),
  );
