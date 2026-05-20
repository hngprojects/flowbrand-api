import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { CreateFunnelDocs, GetFunnelStatusDocs } from './docs/funnels-swagger.doc';
import { CreateFunnelDto, FunnelIdParamDto } from './dto/create-funnel.dto';
import { FunnelRateLimitGuard } from './guards/funnel-rate-limit.guard';

// Swagger decorator factories
import {
  FunnelControllerDecorators,
  ListFunnelsDecorators,
  GetFunnelDecorators,
  GetStagesSummaryDecorators,
  GetStageDetailDecorators,
} from './funnels.swagger';

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

  // Generation endpoints (idempotent create + status polling)
  @Post('generate')
  @UseGuards(FunnelRateLimitGuard)
  @CreateFunnelDocs()
  async generate(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateFunnelDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.funnelsGenService.createGeneration(userId, dto);
    res.status(result.statusCode).json({
      statusCode: result.statusCode,
      message: result.message,
      data: {
        funnel_id: result.funnelId,
        status: result.status,
      },
    });
  }

  @Get('generate/status/:funnelId')
  @HttpCode(HttpStatus.OK)
  @GetFunnelStatusDocs()
  async status(
    @CurrentUser('sub') userId: string,
    @Param() params: FunnelIdParamDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.funnelsGenService.getStatus(params.funnelId, userId);
    res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_STATUS_RETRIEVED,
      data: {
        funnel_id: result.funnelId,
        status: result.status,
        ...(result.redirect ? { redirect: result.redirect } : {}),
        ...(result.error ? { error: result.error } : {}),
      },
    });
  }
}
