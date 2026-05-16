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
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GoogleOAuthProfile, OAuthLoginResponse } from './dto/google-oauth.dto';
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
} from './docs/auth-swagger.doc';

@Controller('auth')
export class AuthController {
  private static readonly REDIRECT_URL = '/dashboard';

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RegisterDocs()
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @LoginDocs()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @RefreshDocs()
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const refreshToken =
      dto.refreshToken ?? (req.cookies?.refreshToken as string | undefined);

    if (!refreshToken) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }

    const result = await this.authService.refresh(refreshToken);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.AUTH_TOKEN_REFRESHED,
      data: result,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @LogoutDocs()
  async logout(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Res() res: Response,
  ) {
    await this.authService.logout(userId, sessionId);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return res.status(HttpStatus.NO_CONTENT).send();
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @GoogleAuthDocs()
  async googleAuth(): Promise<void> {
    // Passport handles the redirect to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @GoogleCallbackDocs()
  async googleAuthRedirect(
    @Req() req: Request & { user?: GoogleOAuthProfile },
    @Res() res: Response,
  ): Promise<void> {
    const payload = req.user;

    if (!payload) {
      res.redirect(
        HttpStatus.FOUND,
        `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=oauth_failed`,
      );
      return;
    }

    try {
      const result: OAuthLoginResponse = await this.authService.handleOAuthLogin(payload);
      const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      res.cookie('refreshToken', result.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      const redirectUrl = `${base}/dashboard?access_token=${encodeURIComponent(result.access_token)}`;
      res.redirect(HttpStatus.FOUND, redirectUrl);
    } catch {
      res.redirect(
        HttpStatus.FOUND,
        `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=oauth_failed`,
      );
    }
  }

  @Get('me')
  @MeDocs()
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }
}
