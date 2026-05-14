import { Controller, Get } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { GetSessionDocs } from './docs/onboarding-swagger.doc';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('onboarding')
export class OnboardingController {
    constructor (private readonly onboardingService: OnboardingService) {}
    
    @Get('session')
    @GetSessionDocs()
    getOnboardingSession(@CurrentUser('sub') id: string) {
        return this.onboardingService.getOnboardingSession(id)
    }
}
