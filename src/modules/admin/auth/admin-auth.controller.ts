import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDocs, AdminLogoutDocs, AdminRefreshTokenDocs } from './docs/admin-auth-swagger.doc';

@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  private getRefreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AdminLoginDocs()
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.adminAuthService.login(dto);
    res.cookie('refreshToken', tokens.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_LOGIN_SUCCESSFUL,
      data: { accessToken: tokens.accessToken },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  @AdminLogoutDocs()
  async logout(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.adminAuthService.logout(userId, sessionId);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { statusCode: HttpStatus.OK, message: SYS_MSG.ADMIN_LOGOUT_SUCCESSFUL };
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @AdminRefreshTokenDocs()
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refreshToken as string | undefined;
    if (!token) {
      throw new UnauthorizedException(SYS_MSG.AUTH_INVALID_REFRESH_TOKEN);
    }
    const tokens = await this.adminAuthService.refreshToken(token);
    res.cookie('refreshToken', tokens.refreshToken, this.getRefreshCookieOptions());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_TOKEN_REFRESHED,
      data: { accessToken: tokens.accessToken },
    };
  }
}
