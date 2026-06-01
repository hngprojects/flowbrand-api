import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { CreateAdminDto } from './dto/create-admin.dto';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminDocs } from './docs/admin-users-swagger.doc';

@ApiTags('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post('create-admin')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AdminJwtGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @CreateAdminDocs()
  async createAdmin(@Body() dto: CreateAdminDto) {
    const result = await this.adminUsersService.createAdmin(dto);
    return { statusCode: HttpStatus.CREATED, message: result.message };
  }
}
