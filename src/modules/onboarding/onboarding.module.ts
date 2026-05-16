import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WizardSessionModelAction } from './actions/wizard-session.action';
import { WizardSession } from './entities/wizzard-session.entity';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [TypeOrmModule.forFeature([WizardSession])],
  controllers: [OnboardingController],
  providers: [OnboardingService, WizardSessionModelAction],
  exports: [OnboardingService, WizardSessionModelAction],
})
export class OnboardingModule {}
