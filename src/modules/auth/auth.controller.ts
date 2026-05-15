import {
  Body,
  Controller,
  Get,
  HttpStatus,
  HttpCode,
  Post,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private static readonly REDIRECT_URL = '/dashboard';

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
    result: Awaited<ReturnType<AuthService['register']>>,
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

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({
    description: 'User registered and logged in',
    schema: {
      example: {
        statusCode: 201,
        message: 'User Created Successfully',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: 'uuid',
            email: 'user@example.com',
            full_name: 'Jane Doe',
          },
          redirectUrl: '/dashboard',
        },
      },
    },
  })
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const result = await this.authService.register(dto);

    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());

    return res.json(
      this.buildAuthResponse(
        HttpStatus.CREATED,
        SYS_MSG.USER_CREATED_SUCCESSFULLY,
        result,
      ),
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({
    description: 'Login successful',
    schema: {
      example: {
        statusCode: 200,
        message: 'Login successful',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: 'uuid',
            email: 'user@example.com',
            full_name: 'Jane Doe',
          },
          redirectUrl: '/dashboard',
        },
      },
    },
  })
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);

    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());

    return res.json(
      this.buildAuthResponse(
        HttpStatus.OK,
        SYS_MSG.AUTH_LOGIN_SUCCESSFUL,
        result,
      ),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue a new access token from a refresh token' })
  @ApiOkResponse({
    description: 'Refresh token exchanged for new access token',
    schema: {
      example: {
        statusCode: 200,
        message: 'Token refreshed successfully',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: 'uuid',
            email: 'user@example.com',
            full_name: 'Jane Doe',
          },
          redirectUrl: '/dashboard',
        },
      },
    },
  })
  async refresh(@Body() dto: RefreshTokenDto, @Res() res: Response) {
    const result = await this.authService.refresh(dto);

    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());

    return res.json(
      this.buildAuthResponse(
        HttpStatus.OK,
        SYS_MSG.AUTH_TOKEN_REFRESHED,
        result,
      ),
    );
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(
    @CurrentUser('sessionId') sessionId: string,
    @Res() res: Response,
  ) {
    await this.authService.logout(sessionId);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return res.status(HttpStatus.NO_CONTENT).send();
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Return the current authenticated user' })
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }
}
