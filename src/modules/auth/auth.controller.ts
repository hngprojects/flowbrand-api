import {
  Body,
  Controller,
  Get,
  HttpStatus,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ThrottleMessage } from '../../common/decorators/throttle-message.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { GoogleOAuthProfile } from './interface/google-oauth.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  GoogleAuthDocs,
  GoogleCallbackDocs,
  LoginDocs,
  LogoutDocs,
  MeDocs,
  RefreshDocs,
  RegisterDocs,
  ResendOtpDocs,
  SendOtpDocs,
  VerifyOtpDocs,
  ForgotPasswordDocs,
  VerifyResetOtpDocs,
  ResetPasswordDocs,
  GoogleExchangeDocs,
} from './docs/auth-swagger.doc';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleExchangeDto } from './dto/google-exchange.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private static readonly REDIRECT_URL = '/dashboard';
  private static readonly OAUTH_REDIRECT_URL = '/onboarding';

  constructor(private readonly authService: AuthService) {}

  private getRefreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  private getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @ThrottleMessage(SYS_MSG.AUTH_REGISTER_RATE_LIMITED)
  @RegisterDocs()
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { message } = await this.authService.register(dto, req);
    return { statusCode: HttpStatus.CREATED, message };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ThrottleMessage(SYS_MSG.AUTH_LOGIN_RATE_LIMITED)
  @LoginDocs()
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, req);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.AUTH_LOGIN_SUCCESSFUL,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    };
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @RefreshDocs()
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? (req.cookies?.refreshToken as string | undefined);

    if (!refreshToken) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const result = await this.authService.refresh(refreshToken);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.AUTH_TOKEN_REFRESHED,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @LogoutDocs()
  async logout(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId, sessionId, req);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { statusCode: HttpStatus.OK, message: SYS_MSG.AUTH_LOGOUT_SUCCESSFUL };
  }

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @SendOtpDocs()
  async sendOtp(@Body() dto: SendOtpDto) {
    const result = await this.authService.sendOtp(dto.email);
    return { statusCode: HttpStatus.OK, message: result.message };
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @VerifyOtpDocs()
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtp(dto.email, dto.otp_code);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.OTP_VERIFIED_SUCCESSFULLY,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    };
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ResendOtpDocs()
  async resendOtp(@Body() dto: ResendOtpDto) {
    const result = await this.authService.resendOtp(dto.email);
    return { statusCode: HttpStatus.OK, message: result.message };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ForgotPasswordDocs()
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto.email);
    return { statusCode: HttpStatus.OK, message: result.message };
  }

  @Public()
  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @VerifyResetOtpDocs()
  async verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    const result = await this.authService.verifyResetOtp(dto.email, dto.otp_code);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.PASSWORD_RESET_OTP_VERIFIED, data: result };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ResetPasswordDocs()
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.resetPassword(dto.reset_token, dto.password);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PASSWORD_RESET_SUCCESSFUL,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    };
  }

  @Get('me')
  @MeDocs()
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @GoogleAuthDocs()
  googleAuth(): void {
    // Passport redirects the request to Google.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @GoogleCallbackDocs()
  async googleAuthRedirect(@Req() req: Request & { user?: GoogleOAuthProfile }, @Res() res: Response): Promise<void> {
    const payload = req.user;

    if (!payload) {
      throw new UnauthorizedException(SYS_MSG.GOOGLE_OAUTH_FAILED);
    }

    const exchangeCode = await this.authService.initiateOAuthExchange(payload);

    // Redirect user to the frontend with the short-lived code query parameter
    const redirectUrl = `${this.getFrontendBaseUrl()}${AuthController.OAUTH_REDIRECT_URL}?code=${encodeURIComponent(exchangeCode)}`;
    res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  @Public()
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  @GoogleExchangeDocs()
  async googleExchange(@Body() dto: GoogleExchangeDto, @Res({ passthrough: true }) res: Response) {
    const oauthResult = await this.authService.exchangeCode(dto.code);
    res.cookie('refreshToken', oauthResult.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
      data: {
        accessToken: oauthResult.accessToken,
        user: oauthResult.data.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    };
  }
}
