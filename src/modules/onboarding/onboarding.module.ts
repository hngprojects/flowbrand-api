import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WizardSession } from './entities/wizard-session.entity';
import { OnboardingModelAction } from './actions/onboarding.action';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [TypeOrmModule.forFeature([WizardSession])],
  controllers: [OnboardingController],
  providers: [OnboardingModelAction, OnboardingService],
  exports: [OnboardingService]
})
export class OnboardingModule {}