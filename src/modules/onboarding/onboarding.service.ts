import { Injectable, NotFoundException } from '@nestjs/common';
import { OnboardingModelAction } from './actions/onboarding.action';
import { WizardSessionStatus } from './enums/wizard-session.enum';

@Injectable()
export class OnboardingService {
    constructor (
        private readonly wizardSessionModelAction: OnboardingModelAction
    ) {}

    async getOnboardingSession(userId: string) {
        const session = await this.wizardSessionModelAction.findActiveSession(userId)

        if(!session) {
            throw new NotFoundException({
                code: 'RESOURCE_NOT_FOUND',
                message: 'Session not found. Please call POST /onboarding/start to begin the wizard.'
            })
        }

        if (session?.status === WizardSessionStatus.IN_PROGRESS && session.expires_at && session.expires_at < new Date()) {
            await this.wizardSessionModelAction.markAsExpired(session.id)

            throw new NotFoundException({
                code: 'RESOURCE_NOT_FOUND',
                message: 'Session has expired. Restart the onboarding process.'
            })
        }

        const cleanedAnswers = Object.fromEntries(
            Object.entries(session.answers).filter(([, value]) => {
                return value !== null
            })
        )

        return {
            sessionId: session.id,
            status: session.status,
            answers: cleanedAnswers,
            created_at: session.created_at,
            expires_at: session.expires_at,
            steps_completed: session.steps_completed
        }
    }

}

