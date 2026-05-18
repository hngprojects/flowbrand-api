export type EmailType = 'otp-verification' | 'otp-reset' | 'password-reset';

export interface OtpPayload {
  fullName: string;
  otpCode: string;
  expiryMins: number;
}

export type EmailPayload = OtpPayload;

export interface EmailJob {
  to: string;
  type: EmailType;
  payload: OtpPayload;
  userId?: string;
  requestId?: string;
}
