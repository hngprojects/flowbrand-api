import { Controller, Get } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
    constructor (private readonly onboardingService: OnboardingService) {}
    
    @Get('session')
    getOnboardingSession(id: string) {
        return this.onboardingService.getOnboardingSession(id)
    }
}
