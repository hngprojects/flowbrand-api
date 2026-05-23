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
import type { CookieOptions, Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
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

  private buildAuthResponse(
    statusCode: HttpStatus,
    message: string,
    result: Awaited<ReturnType<AuthService['login']>>,
  ) {
    return {
      statusCode,
      message,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    };
  }

  private getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RegisterDocs()
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const { message } = await this.authService.register(dto);

    res.status(HttpStatus.CREATED).json({
      success: true,
      statusCode: HttpStatus.CREATED,
      message,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @LoginDocs()
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    return this.buildAuthResponse(HttpStatus.OK, SYS_MSG.AUTH_LOGIN_SUCCESSFUL, result);
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @RefreshDocs()
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      dto.refreshToken ?? (req.cookies?.refreshToken as string | undefined);

    if (!refreshToken) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const result = await this.authService.refresh(refreshToken);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    return this.buildAuthResponse(HttpStatus.OK, SYS_MSG.AUTH_TOKEN_REFRESHED, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @LogoutDocs()
  async logout(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId, sessionId);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  }

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @SendOtpDocs()
  async sendOtp(@Body() dto: SendOtpDto, @Res() res: Response): Promise<void> {
    const result = await this.authService.sendOtp(dto.email);
    res.json({ statusCode: HttpStatus.OK, message: result.message });
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @VerifyOtpDocs()
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res() res: Response): Promise<void> {
    const result = await this.authService.verifyOtp(dto.email, dto.otp_code);
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());
    res.json(this.buildAuthResponse(HttpStatus.OK, SYS_MSG.OTP_VERIFIED_SUCCESSFULLY, result));
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ResendOtpDocs()
  async resendOtp(@Body() dto: ResendOtpDto, @Res() res: Response): Promise<void> {
    const result = await this.authService.resendOtp(dto.email);
    res.json({ statusCode: HttpStatus.OK, message: result.message });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ForgotPasswordDocs()
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Res() res: Response): Promise<void> {
    const result = await this.authService.forgotPassword(dto.email);
    res.json({ statusCode: HttpStatus.OK, message: result.message });
  }

  @Public()
  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @VerifyResetOtpDocs()
  async verifyResetOtp(@Body() dto: VerifyResetOtpDto): Promise<object> {
    const result = await this.authService.verifyResetOtp(dto.email, dto.otp_code);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.PASSWORD_RESET_OTP_VERIFIED, data: result };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ResetPasswordDocs()
  async resetPassword(@Body() dto: ResetPasswordDto, @Res() res: Response): Promise<void> {
    const result = await this.authService.resetPassword(dto.reset_token, dto.password);

    // Set refresh token cookie for auto-login
    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());

    res.json(this.buildAuthResponse(HttpStatus.OK, SYS_MSG.PASSWORD_RESET_SUCCESSFUL, result));
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
  async googleExchange(@Body() dto: GoogleExchangeDto, @Res() res: Response): Promise<Response> {
    const oauthResult = await this.authService.exchangeCode(dto.code);

    res.cookie('refreshToken', oauthResult.refreshToken, this.getRefreshCookieOptions());

    // Return access token and user info matching the standard response template
    return res.json({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.OAUTH_LOGIN_SUCCESSFUL,
      data: {
        accessToken: oauthResult.accessToken,
        user: oauthResult.data.user,
        redirectUrl: AuthController.REDIRECT_URL,
      },
    });
  }
}
