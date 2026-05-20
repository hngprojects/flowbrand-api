import { HttpStatus } from '@nestjs/common';
import { setupSwagger } from './auth-swagger.doc';

const mockCreateDocument = jest.fn();
const mockSetup = jest.fn();

interface SwaggerMockApp {
  use: (path: string, handler: (req: unknown, res: unknown) => void) => void;
}

jest.mock('@nestjs/swagger', () => ({
  ApiBearerAuth: () => () => undefined,
  ApiBody: () => () => undefined,
  ApiBadRequestResponse: () => () => undefined,
  ApiCreatedResponse: () => () => undefined,
  ApiProperty: () => () => undefined,
  ApiOkResponse: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
  ApiTooManyRequestsResponse: () => () => undefined,
  ApiUnauthorizedResponse: () => () => undefined,
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  SwaggerModule: {
    createDocument: (...args: unknown[]) => mockCreateDocument(...args),
    setup: (...args: unknown[]) => mockSetup(...args),
  },
}));

describe('auth-swagger.doc.ts', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('AC-01 — registers the Swagger OAuth redirect script in non-production mode', () => {
    const capturedHandlers: Array<(req: unknown, res: unknown) => void> = [];
    const app: SwaggerMockApp = {
      use: jest.fn((path: string, handler: (req: unknown, res: unknown) => void) => {
        capturedHandlers.push(handler);
      }),
    };

    setupSwagger(app as never);

    expect(capturedHandlers).toHaveLength(1);
    expect(app.use).toHaveBeenCalledWith('/swagger-oauth-redirect.js', capturedHandlers[0]);
    expect(mockCreateDocument).toHaveBeenCalled();

    const [mountPath, documentConfig, setupDocument, setupOptions] = mockSetup.mock.calls[0];

    expect(mountPath).toBe('docs');
    expect(documentConfig).toBeDefined();
    expect(setupDocument).toBeUndefined();
    expect(setupOptions).toEqual({
      customJs: '/swagger-oauth-redirect.js',
      swaggerOptions: { persistAuthorization: true },
    });
  });

  it('AC-02 — returns a 302 Google callback redirect response in the injected script', () => {
    const capturedHandlers: Array<(req: unknown, res: unknown) => void> = [];
    const app: SwaggerMockApp = {
      use: jest.fn((path: string, handler: (req: unknown, res: unknown) => void) => {
        capturedHandlers.push(handler);
      }),
    };

    setupSwagger(app as never);

    const handler = capturedHandlers[0];
    const send = jest.fn();
    const type = jest.fn().mockReturnThis();
    const res = { type, send };

    handler({} as never, res as never);

    expect(type).toHaveBeenCalledWith('application/javascript');
    expect(send).toHaveBeenCalledWith(expect.stringContaining("/auth/google/callback"));
    expect(send).toHaveBeenCalledWith(expect.stringContaining(`status: 302`));
    expect(send).toHaveBeenCalledWith(expect.stringContaining(`Response.redirect(callbackRedirectUrl, 302)`));
    expect(send).toHaveBeenCalledWith(expect.stringContaining(`window.location.origin + '/onboarding#access_token=jwt.access.token'`));
  });

  it('EC-01 — skips the Swagger OAuth mock registration in production mode', () => {
    process.env.NODE_ENV = 'production';

    const app: SwaggerMockApp = {
      use: jest.fn(),
    };

    setupSwagger(app as never);

    expect(app.use).not.toHaveBeenCalled();

    const [mountPath, documentConfig, setupDocument, setupOptions] = mockSetup.mock.calls[0];

    expect(mountPath).toBe('docs');
    expect(documentConfig).toBeDefined();
    expect(setupDocument).toBeUndefined();
    expect(setupOptions).toEqual({
      customJs: undefined,
      swaggerOptions: { persistAuthorization: true },
    });
  });

  it('EC-02 — keeps the Google auth redirect path example on 302 status', () => {
    expect(HttpStatus.FOUND).toBe(302);
  });
});