export type EmailType =
  | 'otp-verification'
  | 'otp-reset'
  | 'waitlist'
  | 'contact-confirmation'
  | 'contact-admin-notification';

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

export type EmailPayload = OtpPayload | WaitlistPayload | ContactConfirmationPayload;

interface BaseEmailJob {
  to: string;
  userId?: string;
  requestId?: string;
}

export type EmailJob = BaseEmailJob &
  (
    | { type: 'otp-verification' | 'otp-reset'; payload: OtpPayload }
    | { type: 'waitlist'; payload: WaitlistPayload }
    | { type: 'contact-confirmation'; payload: ContactConfirmationPayload }
    | { type: 'contact-admin-notification'; payload: ContactAdminNotificationPayload }
  );
