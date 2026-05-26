import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { CreateFunnelDto, FunnelIdParamDto } from './dto/create-funnel.dto';
import {
  CompleteStageDecorators,
  CreateFunnelDocs,
  FunnelControllerDecorators,
  GetFunnelDecorators,
  GetFunnelStatusDocs,
  GetStageDetailDecorators,
  GetStagesSummaryDecorators,
  ListFunnelsDecorators,
} from './docs/funnels-swagger.doc';

// Two services exist in the module: the read-only API service (top-level)
// and the generation service under `services/`. Import both and alias
// them so the controller can use each for its respective endpoints.
import { FunnelsService as FunnelsReadService } from './funnels.service';
import { FunnelsService as FunnelsGenService } from './services/funnels.service';

@FunnelControllerDecorators()
@Controller('funnels')
export class FunnelsController {
  constructor(
    private readonly funnelsReadService: FunnelsReadService,
    private readonly funnelsGenService: FunnelsGenService,
  ) {}

  @ListFunnelsDecorators()
  @Get()
  findAll(@CurrentUser('userId') userId: string, @Query('page') page?: number, @Query('per_page') perPage?: number) {
    return this.funnelsReadService.listForUser(userId, Number(page), Number(perPage));
  }

  @GetFunnelDecorators()
  @Get(':id')
  findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsReadService.getFullFunnel(userId, id);
  }

  @GetStagesSummaryDecorators()
  @Get(':id/stages')
  getStages(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsReadService.getStagesSummary(userId, id);
  }

  @GetStageDetailDecorators()
  @Get(':id/stages/:stageId')
  getStage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.funnelsReadService.getStageDetail(userId, id, stageId);
  }

  @CompleteStageDecorators()
  @Patch(':funnelId/stages/:stageId/complete')
  async completeStage(
    @CurrentUser('userId') userId: string,
    @Param('funnelId', ParseUUIDPipe) funnelId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.funnelsGenService.completeStage(funnelId, stageId, userId);
    res.status(result.statusCode);
    return result;
  }

  // Generation endpoints (idempotent create + status polling)
  @Post('generate')
  @CreateFunnelDocs()
  async generate(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateFunnelDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.funnelsGenService.createGeneration(userId, dto);
    // Dynamic status: 202 ACCEPTED for a new generation, 200 OK for an idempotent repeat
    res.status(result.statusCode);
    return {
      statusCode: result.statusCode,
      message: result.message,
      data: {
        funnel_id: result.funnelId,
        status: result.status,
      },
    };
  }

  @Get('generate/status/:funnelId')
  @HttpCode(HttpStatus.OK)
  @GetFunnelStatusDocs()
  async status(@CurrentUser('userId') userId: string, @Param() params: FunnelIdParamDto) {
    const result = await this.funnelsGenService.getStatus(params.funnelId, userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_STATUS_RETRIEVED,
      data: {
        funnel_id: result.funnelId,
        status: result.status,
        ...(result.redirect ? { redirect: result.redirect } : {}),
        ...(result.error ? { error: result.error } : {}),
      },
    };
  }
}
