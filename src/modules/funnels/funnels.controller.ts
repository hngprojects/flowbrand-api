import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FunnelsService } from './funnels.service';
import {
  funnelListExample,
  funnelFullExample,
  funnelStagesSummaryExample,
  funnelStageDetailExample,
  unauthorizedExample,
  notFoundExample,
  forbiddenStageLockedExample,
} from './funnels.swagger';

@ApiTags('funnels')
@ApiBearerAuth()
@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Get()
  @ApiOperation({ summary: 'List funnels (paginated)' })
  @ApiQuery({ name: 'page', required: false, schema: { default: 1, minimum: 1, type: 'integer' } })
  @ApiQuery({ name: 'per_page', required: false, schema: { default: 20, maximum: 20, minimum: 1, type: 'integer' } })
  @ApiOkResponse({ description: 'Paginated funnel list', schema: { example: funnelListExample } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } })
  findAll(@CurrentUser('userId') userId: string, @Query('page') page?: number, @Query('per_page') perPage?: number) {
    return this.funnelsService.listForUser(userId, Number(page), Number(perPage));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full funnel detail' })
  @ApiOkResponse({ description: 'Full funnel with stages and tasks', schema: { example: funnelFullExample } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } })
  @ApiNotFoundResponse({ description: 'Funnel not found or not owned by the authenticated user', schema: { example: notFoundExample('/api/funnels/{id}') } })
  findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsService.getFullFunnel(userId, id);
  }

  @Get(':id/stages')
  @ApiOperation({ summary: 'Get funnel stages summary' })
  @ApiOkResponse({ description: 'Lean funnel stage summary list', schema: { example: funnelStagesSummaryExample } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } })
  @ApiNotFoundResponse({ description: 'Funnel not found or not owned by the authenticated user', schema: { example: notFoundExample('/api/funnels/{id}/stages') } })
  getStages(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.funnelsService.getStagesSummary(userId, id);
  }

  @Get(':id/stages/:stageId')
  @ApiOperation({ summary: 'Get a single stage detail with lock enforcement' })
  @ApiOkResponse({ description: 'Unlocked stage details with tasks', schema: { example: funnelStageDetailExample } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } })
  @ApiNotFoundResponse({ description: 'Funnel or stage not found, or funnel not owned by the authenticated user', schema: { example: notFoundExample('/api/funnels/{id}/stages/{stageId}') } })
  @ApiForbiddenResponse({ description: 'Stage is locked until the prior stage is completed', schema: { example: forbiddenStageLockedExample('/api/funnels/{id}/stages/{stageId}') } })
  getStage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.funnelsService.getStageDetail(userId, id, stageId);
  }
}
