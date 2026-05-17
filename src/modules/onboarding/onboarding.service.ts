import {
  ConflictException,
  HttpStatus,
  Injectable,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import * as SYS_MSG from '../../constants/system.messages';
import { WizardSessionModelAction } from './actions/wizard-session.action';
import { WizardSession } from './entities/wizzard-session.entity';
import { WizardStatus } from './enums/wizzard-status.enum';
import {
  OnboardingStartResponseData,
  OnboardingStartResult, 
  WizardAnswers,
  OnboardingCompleteResult
} from './interfaces/onboarding.interface';

@Injectable()
export class OnboardingService {
  private static readonly GOAL_MAP: Record<string, string> = {
    Instagram:        'awareness',
    TikTok:           'awareness',
    Facebook:         'awareness',
    LinkedIn:         'awareness',
    WhatsApp:         'sales',
    'Word of mouth':  'retention',
  };

  constructor(
    private readonly wizardSessionModelAction: WizardSessionModelAction,
    private readonly dataSource: DataSource,
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

  async completeOnboarding(userId: string, sessionId: string): Promise<OnboardingCompleteResult> {
    const session = await this.wizardSessionModelAction.findSessionById(sessionId);

    if (!session || session.user_id !== userId) {
      throw new NotFoundException(SYS_MSG.ONBOARDING_SESSION_NOT_FOUND);
    }

    const now = new Date();
    if (session.status === WizardStatus.EXPIRED || session.expires_at <= now) {
      throw new ForbiddenException(SYS_MSG.ONBOARDING_SESSION_EXPIRED)
    }
    
    if (session.status === WizardStatus.COMPLETE) {
      throw new ConflictException({
        error: 'ConflictException',
        message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE
      })
    }

    const answers = session.answers as WizardAnswers;

    this.validateAnswers(answers)

    const discoveryChannel = answers.step_3?.discovery_channel ?? '';
    const primaryGoal = OnboardingService.GOAL_MAP[discoveryChannel] ?? 'awareness';

    await this.dataSource.transaction(async (manager) => {      
      await manager.update(User, userId, {
        business_type:   answers.step_1!.business_type,
        target_customer: answers.step_2!.target_customer,
        primary_goal:    primaryGoal,
      });

      await manager.update(WizardSession, session.id, {
        status: WizardStatus.COMPLETE,
      });
    });

    return {
      status_code: HttpStatus.OK,
      message: SYS_MSG.ONBOARDING_COMPLETE_SUCCESS,
      data: { redirect: { to: 'funnel_generation'} },
    }
  }

  private validateAnswers(answers: WizardAnswers): void {
    const missingSteps: string[] = [];

    if (!answers?.step_1?.business_type)      missingSteps.push('step_1');
    if (!answers?.step_2?.target_customer)    missingSteps.push('step_2');
    if (!answers?.step_3?.discovery_channel)  missingSteps.push('step_3');

    if (missingSteps.length > 0) {
      throw new UnprocessableEntityException({
        message: SYS_MSG.ONBOARDING_INCOMPLETE,
        missing_fields: missingSteps
      })
    }
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
