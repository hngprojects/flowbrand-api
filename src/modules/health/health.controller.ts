import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import * as SYS_MSG from '../../constants/system.messages';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return {
      status: SYS_MSG.HEALTH_OK,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
