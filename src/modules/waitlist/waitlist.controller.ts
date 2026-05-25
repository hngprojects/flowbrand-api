import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
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
  async joinWaitlist(@Body() dto: JoinWaitlistDto, @Res({ passthrough: true }) res: Response) {
    const { user, isNew } = await this.waitlistService.joinWaitlist(dto);

    const statusCode = isNew ? HttpStatus.CREATED : HttpStatus.OK;
    const message = isNew ? SYS_MSG.WAITLIST_JOINED_SUCCESSFULLY : SYS_MSG.WAITLIST_ALREADY_JOINED;

    // Dynamic status — set the HTTP header to match the body statusCode field
    res.status(statusCode);

    return { statusCode, message, data: user };
  }
}
