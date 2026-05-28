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
  SubmitFeedbackDocs,
  UpdateTaskStatusDocs,
} from '../docs/funnels-swagger.doc';
import { SubmitStageFeedbackDto } from '../dto/submit-stage-feedback.dto';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto';

@FunnelControllerDecorators()
@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @ListFunnelsDecorators()
  @Get()
  async findAll(@CurrentUser('userId') userId: string, @Query('page') page?: number, @Query('per_page') perPage?: number) {
    const data = await this.funnelsService.listForUser(userId, Number(page), Number(perPage));
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNELS_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @GetFunnelDecorators()
  @Get(':id')
  async findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.funnelsService.getFullFunnel(userId, id);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

  @GetStagesSummaryDecorators()
  @Get(':id/stages')
  async getStages(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.funnelsService.getStagesSummary(userId, id);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_STAGES_RETRIEVED_SUCCESSFULLY,
      data,
    };
  }

   @GetStageDetailDecorators()
  @Get(':id/stages/:stageId')
  async getStage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    const data = await this.funnelsService.getStageDetail(userId, id, stageId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.FUNNEL_STAGE_RETRIEVED_SUCCESSFULLY,
      data,
    };
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

  @UpdateTaskStatusDocs()
  @Patch(':funnelId/stages/:stageId/tasks/:taskId')
  async updateTaskStatus(
    @CurrentUser('userId') userId: string,
    @Param('funnelId', ParseUUIDPipe) funnelId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.funnelsService.updateTaskStatus(userId, funnelId, stageId, taskId, dto);
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

  @Post(':funnelId/stages/:stageId/feedback')
  @SubmitFeedbackDocs()
  async submitFeedback(
    @CurrentUser('userId') userId: string,
    @Param('funnelId', ParseUUIDPipe) funnelId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: SubmitStageFeedbackDto,
  ) {
    return this.funnelsService.submitFeedback(userId, funnelId, stageId, dto);
  }
}