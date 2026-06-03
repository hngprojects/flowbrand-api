import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UnprocessableEntityException,
  UseGuards,
  ValidationError,
  ValidationPipe,
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
import { AdminSearchQueryDto } from '../dto/admin-search-query.dto';

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
  async search(
    @Query(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
        expectedType: AdminSearchQueryDto,
        validationError: { target: false, value: false },
        exceptionFactory: (errors: ValidationError[]) =>
          new UnprocessableEntityException({
            success: false,
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'UnprocessableEntityException',
            message: SYS_MSG.VALIDATION_FAILED,
            details: errors.map(err => {
              const constraints = err.constraints ? Object.values(err.constraints) : [];
              return `${err.property}: ${constraints.join(', ')}`;
            }),
          }),
      }),
    )
    queryDto: AdminSearchQueryDto,
  ) {
    const data: IAdminSearchResponse = await this.adminSearchService.search(queryDto.q.trim());
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_GLOBAL_SEARCH_SUCCESSFUL,
      data,
    };
  }
}