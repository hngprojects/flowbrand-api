import { HttpStatus } from '@nestjs/common';
import { WizardSession } from '../entities/wizzard-session.entity';
import { WizardStatus } from '../enums/wizzard-status.enum';

/** `data` payload for POST /onboarding/start success responses. */
export interface OnboardingStartResponseData {
  sessionId?: string;
  userId?: string;
  status: WizardStatus;
  stepsCompleted?: number;
  answers?: Record<string, unknown>;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  redirectUrl?: { to: string };
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

// Typed shape of the answers JSON stored on a WizardSession

export interface WizardAnswers {
  step_1?: { business_description?: string };
  step_2?: {
    customer_tags?: { type?: string[]; location?: string[]; wants?: string[] };
    additional_notes?: string;
  };
  step_3?: { discovery_channel?: string };
}
export interface OnboardingCompleteResult {
  statusCode: number;
  message: string;
  data: { redirect: { to: string } };
}