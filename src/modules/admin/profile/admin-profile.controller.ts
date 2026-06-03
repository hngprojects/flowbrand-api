import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  GetAdminProfileDocs,
  UpdateAdminProfileDocs,
} from './docs/admin-profile-swagger.doc';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
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
          }),      }),
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
      const dto = rawDto as unknown as ChangeAdminPasswordDto;
    await this.adminProfileService.changePassword(adminId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_PASSWORD_UPDATED_SUCCESSFULLY,
      data: null,
    };
  }
}
