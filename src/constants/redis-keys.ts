export const redisKeys = {
  activeSession: (userId: string, sessionId: string) => `active_session:${userId}:${sessionId}`,

  session: (userId: string, sessionId: string) => `sess:${userId}:${sessionId}`,

  passwordResetJti: (userId: string) => `password-reset:jti:${userId}`,

  passwordResetRate: (userId: string) => `password-reset:rate:${userId}`,

  refreshRateLimit: (userId: string) => `ratelimit:refresh:${userId}`,

  uploadRateLimit: (userId: string) => `ratelimit:upload:${userId}`,


  adminDashboardStats: () => 'admin-dashboard:stats',
  adminDashboardWeeklyOverview: () => 'admin-dashboard:weekly-overview',
  adminDashboardWeeklyOverview7d: () => 'admin-dashboard:weekly-overview:7d',
  adminDashboardWeeklyOverview12w: () => 'admin-dashboard:weekly-overview:12w',
  adminDashboardUserSegments: () => 'admin-dashboard:user-segments',
  adminDashboardFunnelPerformance: () => 'admin-dashboard:funnel-performance',
  adminDashboardUserStages: () => 'admin-dashboard:user-stages',
  adminDashboardUserRetention: () => 'admin-dashboard:user-retention',
};
