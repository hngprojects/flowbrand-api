import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  UnprocessableEntityException,
  UseGuards,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { AdminProfileService } from './admin-profile.service';
import {
  ChangeAdminPasswordDocs,
  GetAdminNotificationPreferencesDocs,
  GetAdminProfileDocs,
  UpdateAdminNotificationPreferencesDocs,
  UpdateAdminProfileDocs,
} from './docs/admin-profile-swagger.doc';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { UpdateAdminNotificationPreferencesDto } from './dto/update-admin-notification-preferences.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

@ApiTags('admin')
@ApiBearerAuth('JWT')
@Controller('admin/profile')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminProfileController {
  constructor(private readonly adminProfileService: AdminProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @GetAdminProfileDocs()
  async getProfile(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.adminProfileService.getProfile(currentUser.userId, currentUser.role);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_PROFILE_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @Get('notification-preferences')
  @HttpCode(HttpStatus.OK)
  @GetAdminNotificationPreferencesDocs()
  async getNotificationPreferences(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.adminProfileService.getNotificationPreferences(currentUser.userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATION_PREFERENCES_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @Patch('notification-preferences')
  @HttpCode(HttpStatus.OK)
  @UpdateAdminNotificationPreferencesDocs()
  async updateNotificationPreferences(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        expectedType: UpdateAdminNotificationPreferencesDto,
        validationError: { target: false, value: false },
        exceptionFactory: (errors: ValidationError[]) =>
          new UnprocessableEntityException({
            success: false,
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'UnprocessableEntityException',
            message: SYS_MSG.VALIDATION_FAILED,
            details: errors,
          }),
      }),
    )
    rawDto: Record<string, unknown>,
  ) {
    const dto = rawDto as UpdateAdminNotificationPreferencesDto;
    const data = await this.adminProfileService.updateNotificationPreferences(currentUser.userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_NOTIFICATION_PREFERENCES_UPDATED_SUCCESSFULLY,
      data,
    };
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @UpdateAdminProfileDocs()
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        expectedType: UpdateAdminProfileDto,
        validationError: { target: false, value: false },
        exceptionFactory: (errors: ValidationError[]) =>
          new UnprocessableEntityException({
            success: false,
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'UnprocessableEntityException',
            message: SYS_MSG.VALIDATION_FAILED,
            details: errors,
          }),
      }),
    )
    dto: UpdateAdminProfileDto,
  ) {
    const data = await this.adminProfileService.updateProfile(currentUser.userId, dto, currentUser.role);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_PROFILE_UPDATED_SUCCESSFULLY,
      data,
    };
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ChangeAdminPasswordDocs()
  async changePassword(
    @CurrentUser('userId') adminId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        expectedType: ChangeAdminPasswordDto,
        validationError: { target: false, value: false },
        exceptionFactory: (errors: ValidationError[]) =>
          new UnprocessableEntityException({
            success: false,
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'UnprocessableEntityException',
            message: SYS_MSG.VALIDATION_FAILED,
            details: errors,
          }),
      }),
    )
    dto: ChangeAdminPasswordDto,
  ) {
    await this.adminProfileService.changePassword(adminId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_PASSWORD_UPDATED_SUCCESSFULLY,
      data: null,
    };
  }
}
