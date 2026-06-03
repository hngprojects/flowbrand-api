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
  | 'weekly-digest'
  | 'payment-successful'
  | 'payment-failed'
  | 'subscription-cancelled'
  | 'notification-alert';

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
  businessName: string;
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

export interface PaymentSuccessfulPayload {
  name: string;
  /** Pre-formatted naira string, e.g. '₦10,000.00'. */
  amount: string;
  /** null when card details are absent or invalid — template omits the line. */
  cardLast4: string | null;
  cardBrand: string | null;
  /** Paystack transaction reference shown as Transaction ID. */
  reference: string;
  /** Pre-formatted date string e.g. 'May 4, 2026'. null when paid_at is missing — template omits the row. */
  paidAt: string | null;
}

export interface PaymentFailedPayload {
  name: string;
  failureReason?: string;
}

export interface SubscriptionCancelledPayload {
  name: string;
  /** Pre-formatted date string, e.g. 'May 4, 2026'. */
  accessUntil: string;
}

export interface NotificationAlertPayload {
  name: string;
  unreadCount: number;
}

export type EmailPayload =
  | OtpPayload
  | WaitlistPayload
  | ContactConfirmationPayload
  | FunnelReadyPayload
  | StageUnlockedPayload
  | StageCompletedPayload
  | WeeklyDigestPayload
  | PaymentSuccessfulPayload
  | PaymentFailedPayload
  | SubscriptionCancelledPayload
  | NotificationAlertPayload;

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
    | { type: 'payment-successful'; payload: PaymentSuccessfulPayload }
    | { type: 'payment-failed'; payload: PaymentFailedPayload }
    | { type: 'subscription-cancelled'; payload: SubscriptionCancelledPayload }
    | { type: 'notification-alert'; payload: NotificationAlertPayload }
  );
