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
  OnboardingCompleteResult,
} from './interfaces/onboarding.interface';
import { Step1AnswerDto, Step2AnswerDto, Step3AnswerDto, StepAnswerDto } from './dto/step-answer.dto';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class OnboardingService {
  private static readonly GOAL_MAP: Record<string, string> = {
    Instagram: 'awareness',
    TikTok: 'awareness',
    Facebook: 'awareness',
    LinkedIn: 'awareness',
    WhatsApp: 'sales',
    'Word of mouth': 'retention',
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

    const result = await this.wizardSessionModelAction.resolveStartWizardSession(userId, now, expiresAt);

    if (result.status === 'already_complete') {
      throw new ConflictException({
        error: 'ConflictException',
        message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
      });
    }

    const created = result.status === 'created';

    return {
      statusCode: created ? HttpStatus.CREATED : HttpStatus.OK,
      message: created ? SYS_MSG.ONBOARDING_SESSION_STARTED : SYS_MSG.ONBOARDING_SESSION_RESUMED,
      data: this.mapSessionToResponse(result.session),
    };
  }

  async completeOnboarding(userId: string, sessionId: string): Promise<OnboardingCompleteResult> {
  const session = await this.wizardSessionModelAction.findSessionById(sessionId, userId);

  if (!session || session.user_id !== userId) {
    throw new NotFoundException(SYS_MSG.ONBOARDING_SESSION_NOT_FOUND);
  }

  const now = new Date();
  if (session.status === WizardStatus.EXPIRED || session.expires_at <= now) {
    throw new ForbiddenException(SYS_MSG.ONBOARDING_SESSION_EXPIRED);
  }

  if (session.status === WizardStatus.COMPLETE) {
    throw new ConflictException({
      error: 'ConflictException',
      message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
      data: { redirect: { to: 'funnel_generation' } },
    });
  }

  const answers = session.answers as WizardAnswers;
  this.validateAnswers(answers);

  const step2 = answers.step_2!;
  const tags = step2.customer_tags ?? {};
  const tagParts = [
    ...(tags.type ?? []),
    ...(tags.location ?? []),
    ...(tags.wants ?? []),
  ];
  const target_customer = [tagParts.join(', '), step2.additional_notes]
    .filter(Boolean)
    .join('. ');

  const discoveryChannel = answers.step_3?.discovery_channel ?? '';
  const primaryGoal = OnboardingService.GOAL_MAP[discoveryChannel] ?? 'awareness';

  await this.dataSource.transaction(async (manager) => {
    await manager.update(User, userId, {
      business_type: answers.step_1!.business_description,
      target_customer,
      primary_goal: primaryGoal,
    });
    await manager.update(WizardSession, session.id, {
      status: WizardStatus.COMPLETE,
    });
  });

  return {
    statusCode: HttpStatus.OK,
    message: SYS_MSG.ONBOARDING_COMPLETE_SUCCESS,
    data: { redirect: { to: 'funnel_generation' } },
  };
}

private validateAnswers(answers: WizardAnswers): void {
  const missingSteps: string[] = [];

  if (!answers?.step_1?.business_description)        missingSteps.push('step_1');
  if (!answers?.step_2?.customer_tags?.type?.length) missingSteps.push('step_2');
  if (!answers?.step_3?.discovery_channel)           missingSteps.push('step_3');

  if (missingSteps.length > 0) {
    throw new UnprocessableEntityException({
      message: SYS_MSG.ONBOARDING_INCOMPLETE,
      missing_fields: missingSteps,
    });
  }
}

  private mapSessionToResponse(session: WizardSession): OnboardingStartResponseData {
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

  async getOnboardingSession(userId: string) {
    const session = await this.wizardSessionModelAction.findActiveSession(userId);

    if (!session) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: SYS_MSG.ONBOARDING_SESSION_NOT_FOUND,
      });
    }

    if (session.status === WizardStatus.IN_PROGRESS && session.expires_at && session.expires_at < new Date()) {
      await this.wizardSessionModelAction.markAsExpired(session.id);

      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: SYS_MSG.ONBOARDING_SESSION_EXPIRED,
      });
    }

    const cleanedAnswers = Object.fromEntries(Object.entries(session.answers).filter(([, value]) => value !== null));

    return {
      sessionId: session.id,
      status: session.status,
      answers: cleanedAnswers,
      created_at: session.created_at,
      expires_at: session.expires_at,
      steps_completed: session.steps_completed,
    };
  }

  async saveStepAnswer(userId: string, dto: StepAnswerDto) {
    const session = await this.wizardSessionModelAction.findSessionById(dto.session_id, userId);

    if (!session) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: SYS_MSG.ONBOARDING_SESSION_NOT_BELONG,
      });
    }

    if (session.status === WizardStatus.EXPIRED || session.expires_at < new Date()) {
      throw new ForbiddenException({
        code: 'RESOURCE_FORBIDDEN',
        message: SYS_MSG.ONBOARDING_SESSION_FORBIDDEN,
      });
    }

    if (session.status === WizardStatus.COMPLETE) {
      throw new ConflictException({
        code: 'ONBOARDING_ALREADY_COMPLETE',
        message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
      });
    }

    type StepDtoClass = ClassConstructor<Step1AnswerDto | Step2AnswerDto | Step3AnswerDto>;

    const stepDtoMap: Record<number, StepDtoClass> = {
      1: Step1AnswerDto,
      2: Step2AnswerDto,
      3: Step3AnswerDto,
    };

    const StepDto = stepDtoMap[dto.step];
    const answerInstance = plainToInstance(StepDto, dto.answer);
    const errors = await validate(answerInstance);

    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: SYS_MSG.VALIDATION_FAILED,
        fields: errors.reduce(
          (acc, e) => {
            acc[e.property] = Object.values(e.constraints ?? {}).join(', ');
            return acc;
          },
          {} as Record<string, string>,
        ),
      });
    }

    session.answers = {
      ...session.answers,
      [`step_${dto.step}`]: dto.answer,
    };

    session.steps_completed = Object.keys(session.answers).filter((key) => session.answers[key] !== null).length;

    await this.wizardSessionModelAction.saveSession(session);

    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ONBOARDING_STEP_SAVED,
      data: this.mapSessionToResponse(session),
    };
  }
}
