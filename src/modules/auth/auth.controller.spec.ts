import { UnauthorizedException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  refresh: jest.fn(),
  handleOAuthLogin: jest.fn(),
};

describe('AuthController Google OAuth', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('redirects unauthenticated Google callback users to login with oauth_failed', async () => {
    const redirect = jest.fn();

    await controller.googleAuthRedirect({} as never, { redirect } as never);

    expect(redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'http://localhost:3000/login?error=oauth_failed',
    );
  });

  it('sets refresh cookie and redirects to dashboard on successful Google callback', async () => {
    mockAuthService.handleOAuthLogin.mockResolvedValue({
      status_code: 200,
      message: 'OAuth login successful',
      access_token: 'access.jwt',
      refresh_token: 'refresh.jwt',
      data: {
        user: {
          id: 'user-1',
          full_name: 'Jane Doe',
          email: 'jane@example.com',
          avatar_url: null,
        },
      },
    });

    const cookie = jest.fn();
    const redirect = jest.fn();

    await controller.googleAuthRedirect(
      { user: { email: 'jane@example.com' } } as never,
      { cookie, redirect } as never,
    );

    expect(cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh.jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
    expect(redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'http://localhost:3000/dashboard?access_token=access.jwt',
    );
  });

  it('throws unauthorized when refresh endpoint is called without a token', async () => {
    await expect(
      controller.refresh({} as never, {} as never, {} as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});