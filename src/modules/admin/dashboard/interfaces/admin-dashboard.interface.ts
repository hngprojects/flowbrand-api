import { StageStatus } from '../../../funnels/enums/stage-status.enum';
import { UserPlan } from '../../../users/enums/user-plan.enum';

export interface PlanDistribution {
  free: number;
  pro: number;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalFunnelsGenerated: number;
  funnelsThisWeek: number;
  planDistribution: PlanDistribution;
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

export interface UserStageItem {
  stage: string;
  label: string;
  count: number;
}

export interface RetentionBandItem {
  band: string;
  label: string;
  count: number;
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

export interface PlanCountResult {
  plan: UserPlan;
  count: string;
}