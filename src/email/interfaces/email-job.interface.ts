export type EmailType = 'otp-verification' | 'otp-reset' | 'password-reset' | 'waitlist';

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

export type EmailPayload = OtpPayload | WaitlistPayload;

interface BaseEmailJob {
  to: string;
  userId?: string;
  requestId?: string;
}

export type EmailJob = BaseEmailJob &
  (
    | { type: 'otp-verification' | 'otp-reset'; payload: OtpPayload }
    | { type: 'waitlist'; payload: WaitlistPayload }
  );
