import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostStepDocs, StartOnboardingDocs } from './docs/onboarding-swagger.doc';
import { CompleteOnboardingDocs } from './docs/complete-onboarding.swagger';
import { OnboardingService } from './onboarding.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { StepAnswerDto } from './dto/step-answer.dto';

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
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.onboardingService.completeOnboarding(userId, body.session_id);

    res.status(result.statusCode).json({
      success: true,
      statusCode: result.statusCode,
      message: result.message,
      data: result.data,
    });
  }

  @Post('step')
  @HttpCode(HttpStatus.OK)
  @PostStepDocs()
  saveStep(
    @CurrentUser('sub') userId: string,
    @Body() dto: StepAnswerDto
  ) {
    return this.onboardingService.saveStepAnswer(userId, dto)
  }
}
