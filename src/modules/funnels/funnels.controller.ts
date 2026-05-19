import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { CreateFunnelDocs, GetFunnelStatusDocs } from './docs/funnels-swagger.doc';
import { CreateFunnelDto, FunnelIdParamDto } from './dto/create-funnel.dto';
import { FunnelRateLimitGuard } from './guards/funnel-rate-limit.guard';
import { FunnelsService } from './services/funnels.service';

@ApiTags('funnels')
@ApiBearerAuth('JWT')
@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Post('generate')
  @UseGuards(FunnelRateLimitGuard)
  @CreateFunnelDocs()
  async generate(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateFunnelDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.funnelsService.createGeneration(userId, dto);
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
    const result = await this.funnelsService.getStatus(params.funnelId, userId);
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
