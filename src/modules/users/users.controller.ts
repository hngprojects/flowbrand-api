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
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GetUserStateDocs } from './docs/users-swagger.doc';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import {
  GetProfileDocs,
  RemoveAvatarDocs,
  UploadAvatarDocs,
  UpdateProfileDocs,
} from './docs/users-swagger.doc';
import * as SYS_MSG from '../../constants/system.messages';

const avatarUploadInterceptor = FileInterceptor('avatar', {
  storage: memoryStorage(),
});

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

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

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UploadAvatarDocs()
  @UseInterceptors(avatarUploadInterceptor)
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() avatar: Express.Multer.File | undefined,
  ) {
    const data = await this.usersService.uploadAvatar(user.userId, avatar);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PROFILE_AVATAR_UPLOADED_SUCCESSFULLY,
      data,
    };
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  @RemoveAvatarDocs()
  async deleteAvatar(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.usersService.deleteAvatar(user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PROFILE_AVATAR_REMOVED_SUCCESSFULLY,
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  @Get('me/state')
  @GetUserStateDocs()
  async getUserState(@CurrentUser('userId') userId: string) {
    return this.usersService.getUserState(userId);
  }
}
