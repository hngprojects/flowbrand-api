import { INestApplication, applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
        'Reads the refresh token from the request body, or falls back to the HttpOnly `refreshToken` cookie set on login when the body field is omitted. Validates the token and rotates it in place.',
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
        'Sets `is_revoked = true` on the active `user_sessions` row and deletes the matching Redis session key, so neither the refresh token nor the still-unexpired access token can be used again.',
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
      schema: {
        example: {
          statusCode: HttpStatus.FOUND,
          message: 'Redirect to Google OAuth consent screen',
        },
      },
    }),
  );

export const GoogleCallbackDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Handle Google OAuth callback' }),
    ApiOkResponse({
      description: 'Successful OAuth login; returns tokens and sets refresh cookie',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
          access_token: 'jwt.access.token',
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Google OAuth failed or no email was provided',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.GOOGLE_OAUTH_FAILED,
        },
      },
    }),
  );

const SWAGGER_OAUTH_REDIRECT_SCRIPT_PATH = '/swagger-oauth-redirect.js';

function registerSwaggerOAuthRedirectScript(app: INestApplication): void {
  app.use(SWAGGER_OAUTH_REDIRECT_SCRIPT_PATH, (_req: Request, res: Response) => {
    res.type('application/javascript').send(`
      (() => {
        const originalFetch = window.fetch.bind(window);

        window.fetch = (...args) => {
          const [input, init] = args;
          const requestUrl =
            typeof input === 'string'
              ? input
              : input && typeof input === 'object' && 'url' in input
                ? input.url
                : '';
          const method =
            (init && init.method) ||
            (typeof input !== 'string' && input && typeof input === 'object' && 'method' in input
              ? input.method
              : 'GET');

          if (typeof requestUrl === 'string' && String(method).toUpperCase() === 'GET') {
            if (requestUrl.includes('/auth/google/callback')) {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    statusCode: 200,
                    message: 'OAuth login successful',
                    access_token: 'jwt.access.token',
                  }),
                  {
                    status: 200,
                    statusText: 'OK',
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
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                }),
              );
            }
          }

          return originalFetch(...args);
        };
      })();
    `);
  });
}

export function setupSwagger(app: INestApplication): void {
  registerSwaggerOAuthRedirectScript(app);

  const config = new DocumentBuilder()
    .setTitle('SEIL API')
    .setDescription('SEIL REST API documentation')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    customJs: SWAGGER_OAUTH_REDIRECT_SCRIPT_PATH,
    swaggerOptions: { persistAuthorization: true },
  });
}
