import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { ApiJoinWaitlist } from './docs/waitlist-swagger.decorator';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Public()
  @Post('join')
  @ApiJoinWaitlist()
  async joinWaitlist(
    @Body() dto: JoinWaitlistDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, isNew } = await this.waitlistService.joinWaitlist(dto);

    if (isNew) {
      res.status(HttpStatus.CREATED);
      return {
        success: true,
        message: SYS_MSG.WAITLIST_JOINED_SUCCESSFULLY,
        data: user,
      };
    }

    res.status(HttpStatus.OK);
    return {
      success: true,
      message: SYS_MSG.WAITLIST_ALREADY_JOINED,
      data: user,
    };
  }
}
