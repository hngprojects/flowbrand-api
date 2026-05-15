export type EmailType = 'otp-verification' | 'otp-reset';

export interface OtpVerificationPayload {
  fullName: string;
  otpCode: string;
  expiryMins: number;
}

export interface OtpResetPayload {
  fullName: string;
  otpCode: string;
  expiryMins: number;
}

export type EmailPayload = OtpVerificationPayload | OtpResetPayload;

export interface EmailJob {
  to: string;
  type: EmailType;
  payload: EmailPayload;
  userId?: string;
  requestId?: string;
}
