import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FunnelsService } from './funnels.service';

@ApiTags('funnels')
@ApiBearerAuth()
@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Get()
  @ApiOperation({ summary: 'List funnels (paginated)' })
  findAll(@CurrentUser('userId') userId: string, @Query('page') page?: number, @Query('per_page') perPage?: number) {
    return this.funnelsService.listForUser(userId, Number(page), Number(perPage));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full funnel detail' })
  findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsService.getFullFunnel(userId, id);
  }

  @Get(':id/stages')
  @ApiOperation({ summary: 'Get funnel stages summary' })
  getStages(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsService.getStagesSummary(userId, id);
  }

  @Get(':id/stages/:stageId')
  @ApiOperation({ summary: 'Get a single stage detail with lock enforcement' })
  getStage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.funnelsService.getStageDetail(userId, id, stageId);
  }
}
