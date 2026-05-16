import { Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { StartOnboardingDocs } from './docs/onboarding-swagger.doc';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiBearerAuth('JWT')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @StartOnboardingDocs()
  async start(
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.onboardingService.startWizardSession(userId);

    res.status(HttpStatus.CREATED).json({
      status_code: HttpStatus.CREATED,
      message: SYS_MSG.ONBOARDING_API.SESSION_STARTED,
      data,
    });
  }
}
