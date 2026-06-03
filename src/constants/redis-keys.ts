export const redisKeys = {
  activeSession: (userId: string, sessionId: string) =>
    `active_session:${userId}:${sessionId}`,

  session: (userId: string, sessionId: string) =>
    `sess:${userId}:${sessionId}`,

  passwordResetJti: (userId: string) =>
    `password-reset:jti:${userId}`,

  passwordResetRate: (userId: string) =>
    `password-reset:rate:${userId}`,

  adminDashboardStats: () => 'admin-dashboard:stats',
  adminDashboardWeeklyOverview: () => 'admin-dashboard:weekly-overview',
  adminDashboardUserSegments: () => 'admin-dashboard:user-segments',
  adminDashboardFunnelPerformance: () => 'admin-dashboard:funnel-performance',
};