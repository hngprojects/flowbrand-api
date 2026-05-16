import {
  ConflictException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import * as SYS_MSG from '../../constants/system.messages';
import { WizardSessionModelAction } from './actions/wizard-session.action';
import { WizardSession } from './entities/wizzard-session.entity';
import {
  OnboardingStartResponseData,
  OnboardingStartResult,
} from './interfaces/onboarding.interface';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly wizardSessionModelAction: WizardSessionModelAction,
  ) {}

  /**
   * Idempotent start: 201 when created, 200 when an active session is resumed.
   * 409 when the user already completed onboarding.
   */
  async startWizardSession(userId: string): Promise<OnboardingStartResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const result =
      await this.wizardSessionModelAction.resolveStartWizardSession(
        userId,
        now,
        expiresAt,
      );

    if (result.status === 'already_complete') {
      throw new ConflictException({
        error: 'ConflictException',
        message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
      });
    }

    const created = result.status === 'created';

    return {
      statusCode: created ? HttpStatus.CREATED : HttpStatus.OK,
      message: created
        ? SYS_MSG.ONBOARDING_SESSION_STARTED
        : SYS_MSG.ONBOARDING_SESSION_RESUMED,
      data: this.mapSessionToResponse(result.session),
    };
  }

  private mapSessionToResponse(
    session: WizardSession,
  ): OnboardingStartResponseData {
    return {
      session_id: session.id,
      user_id: session.user_id,
      status: session.status,
      steps_completed: session.steps_completed,
      answers: session.answers,
      expires_at: session.expires_at,
      created_at: session.created_at,
      updated_at: session.updated_at,
    };
  }
}
