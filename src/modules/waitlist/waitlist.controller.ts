import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { JoinWaitlistDocs } from './docs/waitlist-swagger.doc';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Public()
  @Post('join')
  @JoinWaitlistDocs()
  async joinWaitlist(@Body() dto: JoinWaitlistDto, @Res() res: Response): Promise<void> {
    const { user, isNew } = await this.waitlistService.joinWaitlist(dto);

    const statusCode = isNew ? HttpStatus.CREATED : HttpStatus.OK;
    const message = isNew ? SYS_MSG.WAITLIST_JOINED_SUCCESSFULLY : SYS_MSG.WAITLIST_ALREADY_JOINED;

    res.status(statusCode).json({
      statusCode,
      message,
      data: user,
    });
  }
}
