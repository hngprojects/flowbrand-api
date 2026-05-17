import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GetSessionDocs, StartOnboardingDocs } from './docs/onboarding-swagger.doc';
import { CompleteOnboardingDocs } from './docs/complete-onboarding.swagger';
import { OnboardingService } from './onboarding.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

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
      statusCode,
      message,
      data,
    });
  }

  @Post('complete')
  @CompleteOnboardingDocs()
  async completeOnboarding(
    @CurrentUser('sub') userId: string,
    @Body() body: CompleteOnboardingDto,
  ) {
    return this.onboardingService.completeOnboarding(userId, body.session_id)
  @Get('session')
  @GetSessionDocs()
  getSession(@CurrentUser('sub') id: string) {
    return this.onboardingService.getOnboardingSession(id)
  }
}
