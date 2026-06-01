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
import { Roles } from '../../../common/decorators/roles.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { AdminProfileService } from './admin-profile.service';
import { GetAdminProfileDocs, UpdateAdminProfileDocs } from './docs/admin-profile-swagger.doc';
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
  async getProfile(@CurrentUser('sub') adminId: string) {
    const data = await this.adminProfileService.getProfile(adminId);
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
    @CurrentUser('sub') adminId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        expectedType: UpdateAdminProfileDto,
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
    const dto = rawDto as UpdateAdminProfileDto;
    const data = await this.adminProfileService.updateProfile(adminId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_PROFILE_UPDATED_SUCCESSFULLY,
      data,
    };
  }
}
