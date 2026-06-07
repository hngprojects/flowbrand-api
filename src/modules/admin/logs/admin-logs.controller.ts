import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { AdminLogsService } from './admin-logs.service';
import { GetAdminLogsDocs } from './docs/admin-logs-swagger.doc';
import { GetAdminLogsQueryDto } from './dto/get-admin-logs-query.dto';

/**
 * Read-only audit trail feed (SEC-01): no create, update or delete endpoints
 * are exposed here. Entries are written exclusively by LogService (BE-ADM-609).
 */
@ApiTags('admin')
@Controller('admin/logs')
export class AdminLogsController {
  constructor(private readonly adminLogsService: AdminLogsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  @GetAdminLogsDocs()
  async listLogs(@Query() query: GetAdminLogsQueryDto) {
    const data = await this.adminLogsService.listLogs(query);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.ADMIN_LOGS_RETRIEVED, data };
  }
}
