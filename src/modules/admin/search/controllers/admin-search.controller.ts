import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../common/decorators/roles.decorator';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { UserRole } from '../../../users/enums/user-role.enum';
import { AdminSearchService } from '../services/admin-search.service';
import { GetAdminSearchDocs } from '../docs/admin-search-swagger.doc';
import { IAdminSearchResponse } from '../interfaces/admin-search.interface';

@ApiTags('admin')
@ApiBearerAuth('JWT')
@Controller('admin/search')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSearchController {
  constructor(private readonly adminSearchService: AdminSearchService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @GetAdminSearchDocs()
  async search(@Query('q') q?: string) {
    if (!q || q.trim().length < 2) {
      throw new UnprocessableEntityException({
        success: false,
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'UnprocessableEntityException',
        message: SYS_MSG.VALIDATION_FAILED,
        details: ['q: Search query must be at least 2 characters long'],
      });
    }

    const data: IAdminSearchResponse = await this.adminSearchService.search(q.trim());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_GLOBAL_SEARCH_SUCCESSFUL,
      data,
    };
  }
}