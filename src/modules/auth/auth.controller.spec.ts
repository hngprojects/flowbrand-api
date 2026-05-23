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
  initiateOAuthExchange: jest.fn(),
  exchangeCode: jest.fn(),
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

  it('redirects to /onboarding with the short-lived exchange code after Google callback', async () => {
    mockAuthService.initiateOAuthExchange.mockResolvedValue('mock-exchange-code-xyz');

    const redirect = jest.fn();

    await controller.googleAuthRedirect({ user: { email: 'jane@example.com' } } as never, { redirect } as never);

    expect(mockAuthService.initiateOAuthExchange).toHaveBeenCalledWith({ email: 'jane@example.com' });
    expect(redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'http://localhost:3000/onboarding?code=mock-exchange-code-xyz',
    );
  });

  it('throws unauthorized when Google callback has no payload', async () => {
    await expect(controller.googleAuthRedirect({} as never, {} as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('POST /auth/google/exchange', () => {
    it('returns the access token, user info and sets refresh cookie on successful exchange', async () => {
      const mockResult = {
        statusCode: 200,
        message: 'OAuth login successful',
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        data: {
          user: {
            id: 'user-1',
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            avatarUrl: null,
          },
        },
      };

      mockAuthService.exchangeCode.mockResolvedValue(mockResult);

      const cookie = jest.fn();
      const json = jest.fn();

      await controller.googleExchange({ code: 'valid-code' }, { cookie, json } as never);

      expect(mockAuthService.exchangeCode).toHaveBeenCalledWith('valid-code');
      expect(cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh.jwt',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      expect(json).toHaveBeenCalledWith({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
        data: {
          accessToken: 'access.jwt',
          user: mockResult.data.user,
          redirectUrl: '/dashboard',
        },
      });
    });
  });
});

describe('AuthController - Password Reset Flow (BE-012)', () => {
  let controller: AuthController;
  let mockResponse: Partial<Response>;

  const USER_EMAIL = 'user@example.com';
  const OTP_CODE = '123456';
  const NEW_PASSWORD = 'NewSecurePass123!';
  const RESET_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.reset...';
  const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  const REFRESH_TOKEN = 'refresh-token-123';

  const mockAuthService = {
    forgotPassword: jest.fn(),
    verifyResetOtp: jest.fn(),
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

      await expect(controller.forgotPassword(forgotPasswordDto, mockResponse as Response)).rejects.toThrow(
        HttpException,
      );
    });

    it('calls service with correct email parameter', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ message: SYS_MSG.PASSWORD_RESET_OTP_SENT });

      await controller.forgotPassword(forgotPasswordDto, mockResponse as Response);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(USER_EMAIL);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /auth/verify-reset-otp', () => {
    it('AC-03: returns 200 with reset_token on success', async () => {
      mockAuthService.verifyResetOtp.mockResolvedValue({ reset_token: RESET_TOKEN });

      const result = await controller.verifyResetOtp({ email: USER_EMAIL, otp_code: OTP_CODE });

      expect(mockAuthService.verifyResetOtp).toHaveBeenCalledWith(USER_EMAIL, OTP_CODE);
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PASSWORD_RESET_OTP_VERIFIED,
        data: { reset_token: RESET_TOKEN },
      });
    });

    it('propagates 400 when OTP is invalid', async () => {
      mockAuthService.verifyResetOtp.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_INVALID_OTP, HttpStatus.BAD_REQUEST),
      );

      await expect(controller.verifyResetOtp({ email: USER_EMAIL, otp_code: OTP_CODE })).rejects.toThrow(HttpException);
    });

    it('propagates 429 when rate limit exceeded', async () => {
      mockAuthService.verifyResetOtp.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_VERIFY_ATTEMPTS_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS),
      );

      await expect(controller.verifyResetOtp({ email: USER_EMAIL, otp_code: OTP_CODE })).rejects.toThrow(HttpException);
    });
  });

  describe('POST /auth/reset-password', () => {
    const resetPasswordDto: ResetPasswordDto = {
      reset_token: RESET_TOKEN,
      password: NEW_PASSWORD,
    };

    const authResponse = {
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      user: mockUser,
    };

    it('AC-04: returns 200 with tokens and sets cookie on success', async () => {
      mockAuthService.resetPassword.mockResolvedValue(authResponse);

      await controller.resetPassword(resetPasswordDto, mockResponse as Response);

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(RESET_TOKEN, NEW_PASSWORD);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        REFRESH_TOKEN,
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
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

    it('AC-05: returns 400 when reset token is invalid', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new HttpException(SYS_MSG.PASSWORD_RESET_INVALID_OTP, HttpStatus.BAD_REQUEST),
      );

      await expect(controller.resetPassword(resetPasswordDto, mockResponse as Response)).rejects.toThrow(HttpException);
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('sets secure cookie options in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      mockAuthService.resetPassword.mockResolvedValue(authResponse);

      await controller.resetPassword(resetPasswordDto, mockResponse as Response);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        REFRESH_TOKEN,
        expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' }),
      );
      process.env.NODE_ENV = originalEnv;
    });

    it('handles service errors without setting cookie', async () => {
      mockAuthService.resetPassword.mockRejectedValue(new Error('Database connection failed'));

      await expect(controller.resetPassword(resetPasswordDto, mockResponse as Response)).rejects.toThrow(
        'Database connection failed',
      );
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('includes redirectUrl in response data', async () => {
      mockAuthService.resetPassword.mockResolvedValue(authResponse);

      await controller.resetPassword(resetPasswordDto, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PASSWORD_RESET_SUCCESSFUL,
        data: { accessToken: ACCESS_TOKEN, user: mockUser, redirectUrl: '/dashboard' },
      });
    });
  });
});
