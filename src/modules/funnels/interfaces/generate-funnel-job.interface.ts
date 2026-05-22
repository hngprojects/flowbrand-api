export interface BusinessContext {
  businessType: string;
  discoveryChannel: string;
  [key: string]: unknown;
}

export interface GenerateFunnelJobPayload {
  funnelId: string;
  userId: string;
}
