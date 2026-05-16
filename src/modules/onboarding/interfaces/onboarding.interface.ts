import { HttpStatus } from '@nestjs/common';
import { WizardSession } from '../entities/wizzard-session.entity';
import { WizardStatus } from '../enums/wizzard-status.enum';

/** `data` payload for POST /onboarding/start success responses. */
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

/** Service result passed to the controller for POST /onboarding/start. */
export interface OnboardingStartResult {
  statusCode: typeof HttpStatus.OK | typeof HttpStatus.CREATED;
  message: string;
  data: OnboardingStartResponseData;
}

/** Internal outcome from atomic start-session DB resolution. */
export type WizardStartResolveResult =
  | { status: 'already_complete' }
  | { status: 'active'; session: WizardSession }
  | { status: 'created'; session: WizardSession };
