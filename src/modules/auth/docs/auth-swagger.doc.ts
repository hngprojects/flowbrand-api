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
import { ResetPasswordDto } from '../dto/reset-password.dto';

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
          message: SYS_MSG.REGISTRATION_SUCCESSFUL_VERIFY_EMAIL,
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
      description: 'Redirects to client after successful OAuth; tokens are issued via cookie and redirect URL',
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
    res.type('application/javascript').send(`
      (() => {
        const originalFetch = (window.fetch && window.fetch.bind) ? window.fetch.bind(window) : null;

        function getStoredJwt() {
          try {
            const auth = localStorage.getItem('authorized');
            if (!auth) return null;
            const parsed = JSON.parse(auth);
            if (parsed && parsed.JWT && parsed.JWT.value) return parsed.JWT.value;
            return null;
          } catch (e) {
            return null;
          }
        }

        // Wrap fetch to inject Authorization header for API requests when a token exists
        if (originalFetch) {
          window.fetch = (input, init) => {
            try {
              const token = getStoredJwt();
              const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
              // Only attach for same-origin API paths
              if (token && typeof url === 'string' && url.includes('/api/')) {
                // Build headers
                const origHeaders = (init && init.headers) || (input && input.headers) || {};
                const headers = new Headers(origHeaders);
                if (!headers.has('Authorization')) {
                  headers.set('Authorization', 'Bearer ' + token);
                }

                if (typeof input === 'string') {
                  const newInit = Object.assign({}, init || {}, { headers });
                  return originalFetch(input, newInit);
                }

                // input might be a Request
                try {
                  const newReq = new Request(input, Object.assign({}, init || {}, { headers }));
                  return originalFetch(newReq);
                } catch (e) {
                  // fallback
                  return originalFetch(input, init);
                }
              }
            } catch (e) {
              // ignore and call original
            }
            return originalFetch(input, init);
          };
        }

        // Keep lightweight mocks for the Google OAuth flow in Swagger UI (GET only)
        const originalFetchForMock = originalFetch;
        if (originalFetchForMock) {
          const wrapped = window.fetch;
          window.fetch = (...args) => {
            try {
              const [input, init] = args;
              const requestUrl = typeof input === 'string' ? input : input && input.url ? input.url : '';
              const method = (init && init.method) || (input && input.method) || 'GET';
              if (typeof requestUrl === 'string' && String(method).toUpperCase() === 'GET') {
                if (requestUrl.includes('/auth/google/callback')) {
                   return Promise.resolve(
                     new Response(
                       JSON.stringify({
                         status_code: 200,
                         message: 'OAuth login successful',
                         access_token: 'jwt.access.token',
                         refresh_token: 'jwt.refresh.token',
                         data: {
                           id: 'uuid',
                           email: 'user@example.com',
                           full_name: 'Jane Doe',
                         },
                       }),
                       {
                         status: 200,
                         headers: { 'Content-Type': 'application/json' },
                       },
                     ),
                   );
                 }
                if (requestUrl.includes('/auth/google')) {
                  return Promise.resolve(
                     new Response('Redirect to Google OAuth consent screen', {
                       status: 302,
                       statusText: 'Redirect to Google OAuth consent screen',
                       headers: {
                         'Content-Type': 'text/plain',
                         Location: '/auth/google/callback',
                       },
                     }),
                   );
                 }
               }
             } catch (e) {
              // noop
            }
            return wrapped(...args);
          };
        }
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
    swaggerOptions: { persistAuthorization: true },
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
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
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

export const ResetPasswordDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Reset password using OTP and auto-login',
      description:
        'Validates the 6-digit OTP against the stored hash. On success: ' +
        '1) Password is updated, 2) All existing sessions are revoked, 3) OTP token is deleted, ' +
        '4) User is automatically logged in with new access/refresh tokens. ' +
        'Rate limited to 5 verification attempts per 5 minutes.',
    }),
    ApiBody({ type: ResetPasswordDto }),
    ApiOkResponse({
      description: 'Password reset successful and user auto-logged in',
      schema: {
        example: {
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
