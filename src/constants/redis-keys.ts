export const redisKeys = {
  activeSession: (userId: string, sessionId: string) => `active_session:${userId}:${sessionId}`,

  session: (userId: string, sessionId: string) => `sess:${userId}:${sessionId}`,

  passwordResetJti: (userId: string) => `password-reset:jti:${userId}`,

  passwordResetRate: (userId: string) => `password-reset:rate:${userId}`,

  refreshRateLimit: (userId: string) => `ratelimit:refresh:${userId}`,

  uploadRateLimit: (userId: string) => `ratelimit:upload:${userId}`,
};
