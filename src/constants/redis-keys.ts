export const redisKeys = {
  activeSession: (userId: string, sessionId: string) =>
    `active_session:${userId}:${sessionId}`,

  session: (userId: string, sessionId: string) =>
    `sess:${userId}:${sessionId}`,

  passwordResetJti: (userId: string) =>
    `password-reset:jti:${userId}`,

  passwordResetRate: (userId: string) =>
    `password-reset:rate:${userId}`,

  adminDashboardStats: () => 'admin_dashboard:stats',
  adminDashboardWeeklyOverview: () => 'admin_dashboard:weekly_overview',
  adminDashboardUserSegments: () => 'admin_dashboard:user_segments',
  adminDashboardFunnelPerformance: () => 'admin_dashboard:funnel_performance',
};