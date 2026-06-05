export type EmailType =
  | 'otp-verification'
  | 'otp-reset'
  | 'password-reset'
  | 'waitlist'
  | 'contact-confirmation'
  | 'contact-admin-notification'
  | 'funnel-ready'
  | 'stage-unlocked'
  | 'stage-completed'
  | 'weekly-digest';

export interface OtpPayload {
  fullName: string;
  otpCode: string;
  expiryMins: number;
}

export interface WaitlistPayload {
  user: {
    name: string;
  };
}
export interface ContactConfirmationPayload {
  fullName: string;
}

export interface ContactAdminNotificationPayload {
  fullName: string;
  email: string;
  businessName?: string | null;
  message: string;
}

export interface FunnelReadyPayload {
  name: string;
  funnelName: string;
}

export interface StageUnlockedPayload {
  name: string;
  stageName: string;
}

export interface StageCompletedPayload {
  name: string;
  stageName: string;
}

export interface WeeklyDigestPayload {
  name: string;
  completedTasks: number;
  totalTasks: number;
  activeStageName: string | null;
}

export type EmailPayload =
  | OtpPayload
  | WaitlistPayload
  | ContactConfirmationPayload
  | FunnelReadyPayload
  | StageUnlockedPayload
  | StageCompletedPayload
  | WeeklyDigestPayload;

interface BaseEmailJob {
  to: string;
  userId?: string;
  requestId?: string;
}

export type EmailJob = BaseEmailJob &
  (
    | { type: 'otp-verification' | 'otp-reset' | 'password-reset'; payload: OtpPayload }
    | { type: 'waitlist'; payload: WaitlistPayload }
    | { type: 'contact-confirmation'; payload: ContactConfirmationPayload }
    | { type: 'contact-admin-notification'; payload: ContactAdminNotificationPayload }
    | { type: 'funnel-ready'; payload: FunnelReadyPayload }
    | { type: 'stage-unlocked'; payload: StageUnlockedPayload }
    | { type: 'stage-completed'; payload: StageCompletedPayload }
    | { type: 'weekly-digest'; payload: WeeklyDigestPayload }
  );
