import { HttpStatus } from '@nestjs/common';
import { StageStatus } from '../enums/stage-status.enum';
import { FunnelStatus } from '../enums/funnel-status.enum';
import type { FunnelStage } from '../entities/funnel-stage.entity';

export interface FunnelGenerationCreateResult {
  statusCode: HttpStatus;
  message: string;
  funnelId: string;
  status: FunnelStatus;
}

export interface FunnelStatusResult {
  funnelId: string;
  status: FunnelStatus;
  redirect?: { to: string };
  error?: { code: string; message: string; retry_endpoint: string };
}

export interface StageCompletionResult {
  completedStage: {
    stageId: string;
    position: number;
    name: string;
    status: StageStatus;
    completedAt: string;
  };
  unlockedStage: {
    stageId: string;
    position: number;
    name: string;
    status: StageStatus;
    unlockedAt: string;
  } | null;
}

export type FunnelStageEntity = FunnelStage;

export interface SubmitFeedbackResponse {
  statusCode: number;
  message: string;
  data: {
    feedbackId: string;
    stageId: string;
    comment: string | null;
    submittedAt: string;
  };
}