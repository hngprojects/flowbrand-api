import { Injectable, NotFoundException } from '@nestjs/common';
import { UserModelAction } from './actions/user.action';
import { WizardSessionModelAction } from '../onboarding/actions/wizard-session.action';
import { FunnelModelAction } from '../funnels/actions/funnel.action';
import { FunnelStageModelAction } from '../funnels/actions/funnel-stage.action';
import { StageTaskModelAction } from '../funnels/actions/stage-task.action';
import { WizardStatus } from '../onboarding/enums/wizzard-status.enum';
import { FunnelStatus } from '../funnels/enums/funnel-status.enum';
import { StageStatus } from '../funnels/enums/stage-status.enum';
import { RedisService } from './../redis/redis.service';
import { UserStateResponse, OnboardingState, ActiveFunnel, CurrentStage } from './interfaces/user-state.interface';
import * as SYS_MSG from '../../constants/system.messages';

@Injectable()
export class UserStateService {
  constructor(
    private readonly userModelAction: UserModelAction,
    private readonly wizardSessionModelAction: WizardSessionModelAction,
    private readonly funnelModelAction: FunnelModelAction,
    private readonly funnelStageModelAction: FunnelStageModelAction,
    private readonly stageTaskModelAction: StageTaskModelAction,
    private readonly redisService: RedisService,
  ) {}

  async getUserState(userId: string): Promise<UserStateResponse> {
    const cacheKey = `user-state:${userId}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as UserStateResponse;
      } catch {
        await this.redisService.del(cacheKey);
      }
    }

    const user = await this.userModelAction.findById(userId);
    if (!user) {
      throw new NotFoundException(SYS_MSG.USER_NOT_FOUND_BY_TOKEN);
    }

    const onboarding = await this.getOnboardingState(userId);
    const activeFunnel = await this.getActiveFunnelState(userId);

    const response: UserStateResponse = {
      onboarding,
      activeFunnel,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 20);

    return response;
  }

  private async getOnboardingState(userId: string): Promise<OnboardingState> {
    const session = await this.wizardSessionModelAction.findActiveSession(userId);

    if (!session) {
      return { status: 'not_started' };
    }

    if (session.status === WizardStatus.COMPLETE) {
      return { status: 'complete' };
    }

    const now = new Date();
    if (session.status === WizardStatus.IN_PROGRESS && session.expires_at > now) {
      return {
        status: 'in_progress',
        sessionId: session.id,
        stepsCompleted: session.steps_completed,
      };
    }

    return { status: 'not_started' };
  }

  async invalidateUserStateCache(userId: string): Promise<void> {
    const cacheKey = `user-state:${userId}`;
    await this.redisService.del(cacheKey);
  }

  private async getActiveFunnelState(userId: string): Promise<ActiveFunnel | null> {
    const funnels = await this.funnelModelAction.findFunnelsByUserId(userId);

    const nonFailedFunnels = funnels.filter((f) => f.status !== FunnelStatus.FAILED);

    if (nonFailedFunnels.length === 0) {
      return null;
    }

    // Priority: ACTIVE (1) > GENERATING (2); tiebreaker is newest created_at first.
    // This ensures a user with both an active and a generating funnel always sees
    // the active one until the new generation completes (EC-01).
    const STATUS_PRIORITY: Partial<Record<FunnelStatus, number>> = {
      [FunnelStatus.ACTIVE]: 1,
      [FunnelStatus.GENERATING]: 2,
    };

    const selectedFunnel =
      nonFailedFunnels
        .filter((f) => STATUS_PRIORITY[f.status] !== undefined)
        .sort((a, b) => {
          const priorityDiff = (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99);
          if (priorityDiff !== 0) return priorityDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })[0] ?? null;

    if (!selectedFunnel) {
      return null;
    }

    if (selectedFunnel.status === FunnelStatus.GENERATING) {
      return {
        funnelId: selectedFunnel.id,
        businessName: selectedFunnel.business_name,
        status: 'generating',
        createdAt: selectedFunnel.created_at,
        currentStage: null,
      };
    }

    const stages = await this.funnelStageModelAction.getStagesByFunnelId(selectedFunnel.id);

    const activeStage = stages.find((s) => s.status === StageStatus.ACTIVE);

    let currentStage: CurrentStage | null = null;
    if (activeStage) {
      const tasks = await this.stageTaskModelAction.findTasksByStageId(activeStage.id);

      const tasksTotal = tasks.length;
      const tasksComplete = tasks.filter((task) => task.is_complete).length;

      currentStage = {
        stageId: activeStage.id,
        position: activeStage.position,
        name: activeStage.name,
        status: activeStage.status,
        unlockedAt: activeStage.unlocked_at,
        tasksTotal,
        tasksComplete,
      };
    }

    return {
      funnelId: selectedFunnel.id,
      businessName: selectedFunnel.business_name,
      status: 'active',
      createdAt: selectedFunnel.created_at,
      currentStage,
    };
  }
}
