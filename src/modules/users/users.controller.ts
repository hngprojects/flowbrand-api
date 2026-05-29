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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChangePasswordDto } from './dto/change-password.dto'
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { GetProfileDocs, UpdateProfileDocs, GetUserStateDocs, DeleteAccountDocs, ChangePasswordDocs } from './docs/users-swagger.doc';
import { DeleteAccountDto } from './dto/delete-account.dto';
import * as SYS_MSG from '../../constants/system.messages';

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

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
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserProfileDto,
  ) {
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
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ACCOUNT_DELETED_SUCCESSFULLY,
    };
  }

  @Get('me/state')
  @GetUserStateDocs()
  async getUserState(@CurrentUser('userId') userId: string) {
    const data = await this.usersService.getUserState(userId);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.USER_STATE_RETRIEVED, data };
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
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
