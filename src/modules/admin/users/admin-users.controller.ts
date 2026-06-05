import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import * as SYS_MSG from '../../../constants/system.messages';
import { CreateAdminDto } from './dto/create-admin.dto';
import { GetAdminUsersQueryDto } from './dto/get-admin-users-query.dto';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminDocs, GetAdminUsersDocs } from './docs/admin-users-swagger.doc';

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

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  @GetAdminUsersDocs()
  async listUsers(@Query() query: GetAdminUsersQueryDto) {
    const data = await this.adminUsersService.listUsers(query);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.ADMIN_USERS_LIST_RETRIEVED, data };
  }
}
