import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChangePasswordDto } from './dto/change-password.dto'
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import {
  ChangePasswordDocs,
  GetNotificationPreferencesDocs,
  GetProfileDocs,
  UpdateNotificationPreferencesDocs,
  UpdateProfileDocs,
  GetUserStateDocs,
  DeleteAccountDocs,
} from './docs/users-swagger.doc';
import { DeleteAccountDto } from './dto/delete-account.dto';
import * as SYS_MSG from '../../constants/system.messages';
import { UpdateNotificationPreferencesDto } from '../notifications/dto/update-notification-preferences.dto';

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @GetProfileDocs()
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.usersService.getProfile(user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PROFILE_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UpdateProfileDocs()
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserProfileDto) {
    const data = await this.usersService.updateProfile(user.userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PROFILE_UPDATED_SUCCESSFULLY,
      data,
    };
  }

  @Delete('me')
  @DeleteAccountDocs()
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @CurrentUser('userId') userId: string,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.usersService.deleteAccount(userId, dto.confirmation);
    return  {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ACCOUNT_DELETED_SUCCESSFULLY,
    };
  }

  @Get('me/state')
  @GetUserStateDocs()
  async getUserState(@CurrentUser('userId') userId: string) {
    return this.usersService.getUserState(userId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch('me/password')
  @ChangePasswordDocs()
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentUser('sub') userId: string, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PASSWORD_CHANGE_SUCCESSFUL,
      data: null,
    };
  }

  @Get('me/notification-preferences')
  @HttpCode(HttpStatus.OK)
  @GetNotificationPreferencesDocs()
  async getNotificationPreferences(@CurrentUser('userId') userId: string) {
    const data = await this.usersService.getNotificationPreferences(userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATION_PREFERENCES_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @Patch('me/notification-preferences')
  @HttpCode(HttpStatus.OK)
  @UpdateNotificationPreferencesDocs()
  async updateNotificationPreferences(
    @CurrentUser('userId') userId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        expectedType: UpdateNotificationPreferencesDto,
      }),
    )
    rawDto: Record<string, unknown>,
  ) {
    const dto = rawDto as UpdateNotificationPreferencesDto;
    const data = await this.usersService.updateNotificationPreferences(userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.NOTIFICATION_PREFERENCES_UPDATED_SUCCESSFULLY,
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
