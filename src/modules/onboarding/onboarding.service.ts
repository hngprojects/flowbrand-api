import { ConflictException, Injectable } from '@nestjs/common';
import * as SYS_MSG from '../../constants/system.messages';
import { WizardSession } from './entities/wizzard-session.entity';
import { WizardStatus } from './enums/wizzard-status.enum';
import { WizardSessionModelAction } from './actions/wizard-session.action';

export interface OnboardingStartResponseData {
  session_id: string;
  user_id: string;
  status: WizardStatus;
  steps_completed: number;
  answers: Record<string, unknown>;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly wizardSessionModelAction: WizardSessionModelAction,
  ) {}

  /**
   * Idempotent start: returns existing active in-progress session or creates a new one.
   * Users who already completed onboarding get 409.
   */
  async startWizardSession(
    userId: string,
  ): Promise<OnboardingStartResponseData> {
    const completed =
      await this.wizardSessionModelAction.findCompletedByUserId(userId);
    if (completed) {
      throw new ConflictException({
        error: 'ConflictException',
        message: SYS_MSG.ONBOARDING_API.ALREADY_COMPLETE,
        code: SYS_MSG.ONBOARDING_API.ALREADY_COMPLETE,
      });
    }

    const now = new Date();
    const existingActive =
      await this.wizardSessionModelAction.findActiveInProgressByUserId(
        userId,
        now,
      );
    if (existingActive) {
      return this.mapSessionToResponse(existingActive);
    }

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const created = await this.wizardSessionModelAction.createWizardSession({
      user_id: userId,
      status: WizardStatus.IN_PROGRESS,
      steps_completed: 0,
      answers: {},
      expires_at: expiresAt,
    });

    return this.mapSessionToResponse(created);
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
