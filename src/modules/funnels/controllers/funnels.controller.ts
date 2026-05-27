import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../../constants/system.messages';
import { CreateFunnelDto, FunnelIdParamDto } from '../dto/create-funnel.dto';
import { FunnelsService } from '../services/funnels.service';
import {
  CompleteStageDecorators,
  CreateFunnelDocs,
  FunnelControllerDecorators,
  GetFunnelDecorators,
  GetFunnelStatusDocs,
  GetStageDetailDecorators,
  GetStagesSummaryDecorators,
  ListFunnelsDecorators,
} from '../docs/funnels-swagger.doc';

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

  @CompleteStageDecorators()
  @Patch(':funnelId/stages/:stageId/complete')
  async completeStage(
    @CurrentUser('userId') userId: string,
    @Param('funnelId', ParseUUIDPipe) funnelId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.funnelsService.completeStage(funnelId, stageId, userId);
  }

  @Post('generate')
  @CreateFunnelDocs()
  async generate(@CurrentUser('userId') userId: string, @Body() dto: CreateFunnelDto) {
    const result = await this.funnelsService.createGeneration(userId, dto);
    return {
      statusCode: result.statusCode,
      message: result.message,
      data: {
        funnelId: result.funnelId,
        status: result.status,
      },
    };
  }

  @Get('generate/status/:funnelId')
  @HttpCode(HttpStatus.OK)
  @GetFunnelStatusDocs()
  async status(@CurrentUser('userId') userId: string, @Param() params: FunnelIdParamDto) {
    const result = await this.funnelsService.getStatus(params.funnelId, userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_STATUS_RETRIEVED,
      data: {
        funnelId: result.funnelId,
        status: result.status,
        ...(result.redirect ? { redirect: result.redirect } : {}),
        ...(result.error ? { error: result.error } : {}),
      },
    };
  }
}