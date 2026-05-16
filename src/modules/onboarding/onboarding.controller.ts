import { Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StartOnboardingDocs } from './docs/onboarding-swagger.doc';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiBearerAuth('JWT')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('start')
  @StartOnboardingDocs()
  async start(
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { statusCode, message, data } =
      await this.onboardingService.startWizardSession(userId);

    res.status(statusCode).json({
      status_code: statusCode,
      message,
      data,
    });
  }
}
