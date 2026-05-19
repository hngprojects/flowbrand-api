import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FunnelsService } from './funnels.service';
import {
  FunnelControllerDecorators,
  ListFunnelsDecorators,
  GetFunnelDecorators,
  GetStagesSummaryDecorators,
  GetStageDetailDecorators,
} from './funnels.swagger';

@FunnelControllerDecorators()
@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @ListFunnelsDecorators()
  @Get()
  findAll(@CurrentUser('userId') userId: string, @Query('page') page?: number, @Query('per_page') perPage?: number) {
    return this.funnelsService.listForUser(userId, Number(page), Number(perPage));
  }

  @GetFunnelDecorators()
  @Get(':id')
  findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsService.getFullFunnel(userId, id);
  }

  @GetStagesSummaryDecorators()
  @Get(':id/stages')
  getStages(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsService.getStagesSummary(userId, id);
  }

  @GetStageDetailDecorators()
  @Get(':id/stages/:stageId')
  getStage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.funnelsService.getStageDetail(userId, id, stageId);
  }
}
