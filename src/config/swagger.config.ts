import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';

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

          if (
            typeof requestUrl === 'string' &&
            requestUrl.includes('/auth/google') &&
            String(method).toUpperCase() === 'GET'
          ) {
            window.location.assign(requestUrl);
            return Promise.reject(new Error('Redirecting to Google OAuth consent page'));
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
