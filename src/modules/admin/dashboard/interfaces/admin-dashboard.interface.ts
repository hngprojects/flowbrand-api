import { StageStatus } from '../../../funnels/enums/stage-status.enum';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalFunnelsGenerated: number;
  funnelsThisWeek: number;
}

export interface WeeklyOverviewItem {
  date: string;
  newUsers: number;
  funnelsGenerated: number;
}

export interface UserSegmentItem {
  label: string;
  count: number;
  percentage: number;
}

export interface FunnelPerformanceItem {
  stagePosition: number;
  stageName: string;
  completionRate: number;
}

export interface CountResult {
  date: Date;
  count: string;
}

export interface SegmentResult {
  label: string | null;
  count: string;
}

export interface StageCountResult {
  position: number;
  name: string;
  status: StageStatus;
  count: string;
}

export interface GroupedStageAccumulator {
  position: number;
  name: string;
  total: number;
  completed: number;
}