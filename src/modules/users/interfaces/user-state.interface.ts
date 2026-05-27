import { StageStatus } from "../../funnels/enums/stage-status.enum";

export type OnboardingStateStatus = "complete" | "in_progress" | "not_started";

export interface OnboardingState {
  status: OnboardingStateStatus;
  sessionId?: string;
  stepsCompleted?: number;
}

export interface CurrentStage {
  stageId: string;
  position: number;
  name: string;
  status: StageStatus;
  unlockedAt: Date | null;
  tasksTotal: number;
  tasksComplete: number;
}

export type ActiveFunnelStatus = "active" | "generating";

export interface ActiveFunnel {
  funnelId: string;
  businessName: string;
  status: ActiveFunnelStatus;
  createdAt: Date;
  currentStage: CurrentStage | null;
}

export interface UserStateData {
  onboarding: OnboardingState;
  activeFunnel: ActiveFunnel | null;
}

export type UserStateResponse = UserStateData;