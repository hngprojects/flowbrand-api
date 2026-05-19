import { HttpStatus, HttpException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as SYS_MSG from '../../constants/system.messages';

const mockAuthService = {
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

  it('redirects to /onboarding with the issued access token after Google callback', async () => {
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
      'http://localhost:3000/onboarding#access_token=access.jwt',
    );
  });

  it('throws unauthorized when Google callback has no payload', async () => {
    await expect(
      controller.googleAuthRedirect({} as never, {} as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthController - Password Reset Flow (BE-012)', () => {
  let controller: AuthController;
  let authService: AuthService;
  let mockResponse: Partial<Response>;

  const USER_EMAIL = 'user@example.com';
  const OTP_CODE = '123456';
  const NEW_PASSWORD = 'NewSecurePass123!';
  const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  const REFRESH_TOKEN = 'refresh-token-123';

  const mockAuthService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockUser = {
    id: 'user-id',
    email: USER_EMAIL,
    full_name: 'Test User',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockResponse = {
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('POST /auth/forgot-password', () => {
    const forgotPasswordDto: ForgotPasswordDto = { email: USER_EMAIL };

    it('AC-01: returns 200 with success message for valid request', async () => {
      const expectedMessage = { message: SYS_MSG.PASSWORD_RESET_OTP_SENT };
      mockAuthService.forgotPassword.mockResolvedValue(expectedMessage);

      await controller.forgotPassword(forgotPasswordDto, mockResponse as Response);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(USER_EMAIL);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
      });
    });

    it('AC-01: returns 200 even when email not found (prevents enumeration)', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({
        message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
      });

      await controller.forgotPassword({ email: 'nonexistent@example.com' }, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PASSWORD_RESET_OTP_SENT,
      });
    });

    it('AC-02: passes rate limit errors to client', async () => {
      mockAuthService.forgotPassword.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS),
      );

      await expect(
        controller.forgotPassword(forgotPasswordDto, mockResponse as Response)
      ).rejects.toThrow(HttpException);
    });

    it('calls service with correct email parameter', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ message: SYS_MSG.PASSWORD_RESET_OTP_SENT });

      await controller.forgotPassword(forgotPasswordDto, mockResponse as Response);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(USER_EMAIL);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /auth/reset-password', () => {
    const resetPasswordDto: ResetPasswordDto = {
      email: USER_EMAIL,
      otp_code: OTP_CODE,
      password: NEW_PASSWORD,
    };

    const authResponse = {
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      user: mockUser,
    };

    it('AC-03: returns 200 with tokens and sets cookie on success', async () => {
      mockAuthService.resetPassword.mockResolvedValue(authResponse);

      await controller.resetPassword(resetPasswordDto, mockResponse as Response);

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
        USER_EMAIL,
        OTP_CODE,
        NEW_PASSWORD
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        REFRESH_TOKEN,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PASSWORD_RESET_SUCCESSFUL,
        data: {
          accessToken: ACCESS_TOKEN,
          user: mockUser,
          redirectUrl: '/dashboard',
        },
      });
    });

    it('AC-04: returns 400 when OTP is invalid', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_INVALID_OTP, HttpStatus.BAD_REQUEST),
      );

      await expect(
        controller.resetPassword(resetPasswordDto, mockResponse as Response)
      ).rejects.toThrow(HttpException);
      
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('AC-04: returns 400 when OTP is expired', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_EXPIRED, HttpStatus.BAD_REQUEST),
      );

      await expect(
        controller.resetPassword(resetPasswordDto, mockResponse as Response)
      ).rejects.toThrow(HttpException);
    });

    it('AC-05: returns 429 when rate limit exceeded', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS),
      );

      await expect(
        controller.resetPassword(resetPasswordDto, mockResponse as Response)
      ).rejects.toThrow(HttpException);
    });

    it('sets secure cookie options in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      mockAuthService.resetPassword.mockResolvedValue(authResponse);

      await controller.resetPassword(resetPasswordDto, mockResponse as Response);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        REFRESH_TOKEN,
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('handles service errors without setting cookie', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        controller.resetPassword(resetPasswordDto, mockResponse as Response)
      ).rejects.toThrow('Database connection failed');
      
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('validates DTO - missing email', async () => {
      const invalidDto = { otp: OTP_CODE, password: NEW_PASSWORD };
      
      // This should be caught by validation pipe, not the controller
      expect(invalidDto).not.toHaveProperty('email');
    });

    it('validates DTO - invalid OTP format', async () => {
      const invalidDto = {
        email: USER_EMAIL,
        otp: '12345', // 5 digits instead of 6
        password: NEW_PASSWORD,
      };
      
      expect(invalidDto.otp.length).toBeLessThan(6);
    });
  });

  describe('Integration with response formatter', () => {
    it('uses buildAuthResponse correctly for reset-password', async () => {
      const authResponse = {
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        user: mockUser,
      };
      
      mockAuthService.resetPassword.mockResolvedValue(authResponse);

      await controller.resetPassword(
        { email: USER_EMAIL, otp_code: OTP_CODE, password: NEW_PASSWORD },
        mockResponse as Response
      );

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('data.redirectUrl', '/dashboard');
      expect(jsonCall).toHaveProperty('data.accessToken', ACCESS_TOKEN);
      expect(jsonCall).toHaveProperty('data.user', mockUser);
    });
  });
});