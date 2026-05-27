import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { UserModelAction } from './actions/user.action';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { WizardSessionModelAction } from '../onboarding/actions/wizard-session.action';
import { FunnelModelAction } from '../funnels/actions/funnel.action';
import { FunnelStageModelAction } from '../funnels/actions/funnel-stage.action';
import { StageTaskModelAction } from '../funnels/actions/stage-task.action';
import { WizardStatus } from '../onboarding/enums/wizzard-status.enum';
import { FunnelStatus } from '../funnels/enums/funnel-status.enum';
import { StageStatus } from '../funnels/enums/stage-status.enum';
import { RedisService } from './../redis/redis.service';
import {
  UserStateResponse,
  OnboardingState,
  ActiveFunnel,
  CurrentStage,
} from './interfaces/user-state.interface';
import * as SYS_MSG from '../../constants/system.messages';

const BCRYPT_ROUNDS = 10;
const NO_TRANSACTION = {
  transactionOptions: { useTransaction: false as const },
};

@Injectable()
export class UsersService {
  constructor(
    private readonly userModelAction:UserModelAction,
    private readonly wizardSessionModelAction: WizardSessionModelAction,
    private readonly funnelModelAction: FunnelModelAction,
    private readonly funnelStageModelAction: FunnelStageModelAction,
    private readonly stageTaskModelAction: StageTaskModelAction,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userModelAction.findByEmail(dto.email);
    if (existing) {
      if (existing.is_active === false) {
        throw new ConflictException(SYS_MSG.USER_ACCOUNT_LOCKED);
      }
      throw new ConflictException(SYS_MSG.USER_EMAIL_IN_USE);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.userModelAction.create({
        ...NO_TRANSACTION,
        createPayload: {
          email: dto.email,
          termsAccepted: dto.termsAccepted ?? false,
          password_hash: passwordHash,
          full_name: dto.fullName,
          roles: [
            {
              role: dto.role ?? UserRole.USER,
            },
          ],
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code ===
          '23505'
      ) {
        throw new ConflictException(SYS_MSG.USER_EMAIL_IN_USE);
      }

      throw error;
    }
  }

  async createGoogleAccount(dto: {
    email: string;
    fullName: string;
    providerUserId: string;
    avatarUrl: string | null;
  }): Promise<User> {
    try {
      return await this.userModelAction.create({
        ...NO_TRANSACTION,
        createPayload: {
          email: dto.email,
          full_name: dto.fullName,
          password_hash: null,
          termsAccepted: true,
          is_verified: true,
          auth_provider: 'google',
          provider_user_id: dto.providerUserId,
          avatar_url: dto.avatarUrl,
          roles: [
            {
              role: UserRole.USER,
            },
          ],
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code ===
          '23505'
      ) {
        throw new ConflictException(SYS_MSG.USER_EMAIL_IN_USE);
      }

      throw error;
    }
  }

  findAll(pagination: PaginationDto) {
    return this.userModelAction.list({
      paginationPayload: { page: pagination.page!, limit: pagination.limit! },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModelAction.get({
      identifierOptions: { id },
    });
    if (!user) throw new NotFoundException(SYS_MSG.USER_NOT_FOUND(id));
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userModelAction.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findById(id);

    const payload: Partial<User> = {};

    if (dto.fullName !== undefined) payload.full_name = dto.fullName;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.termsAccepted !== undefined) payload.termsAccepted = dto.termsAccepted;
  
    if (dto.password) {
      payload.password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id },
      updatePayload: payload,
    });
    if (!updated) {
      throw new InternalServerErrorException(
        SYS_MSG.USER_UPDATE_FAILED,
      );
    }
    return updated;
  }

  async updateGoogleAccount(
    id: string,
    dto: {
      fullName: string;
      providerUserId: string;
      avatarUrl: string | null;
    },
  ): Promise<User> {
    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id },
      updatePayload: {
        full_name: dto.fullName,
        is_verified: true,
        auth_provider: 'google',
        provider_user_id: dto.providerUserId,
        avatar_url: dto.avatarUrl,
      },
    });

    if (!updated) {
      throw new InternalServerErrorException(
        SYS_MSG.USER_UPDATE_FAILED,
      );
    }
    return updated;
  }

  async markVerified(userId: string): Promise<User> {
    const updated = await this.userModelAction.update({
      ...NO_TRANSACTION,
      identifierOptions: { id: userId },
      updatePayload: { is_verified: true },
    });
    if (!updated) {
      throw new InternalServerErrorException(SYS_MSG.USER_UPDATE_FAILED);
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.userModelAction.delete({
      ...NO_TRANSACTION,
      identifierOptions: { id },
    });
  }

  /**
   * BE-013: Get complete dashboard state for authenticated user
   */
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

    const user = await this.userModelAction.findById(userId)
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

  async invalidateUserStateCache(userId: string): Promise<void> {
    const cacheKey = `user-state:${userId}`;
    await this.redisService.del(cacheKey);
  }

  private async getOnboardingState(userId: string): Promise<OnboardingState> {
    const session = await this.wizardSessionModelAction.findActiveSession(userId)

    if (!session) {
      return { status: 'not_started' }
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

  private async getActiveFunnelState(userId: string): Promise<ActiveFunnel | null> {
    const funnels = await this.funnelModelAction.findFunnelsByUserId(userId);
    
    const nonFailedFunnels = funnels.filter(f => f.status !== FunnelStatus.FAILED);

    if (nonFailedFunnels.length === 0) {
      return null;
    }

    const activeFunnel = nonFailedFunnels.find(f => f.status === FunnelStatus.ACTIVE);
    const generatingFunnel = nonFailedFunnels.find(f => f.status === FunnelStatus.GENERATING);

    const selectedFunnel = activeFunnel ?? generatingFunnel;
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

    const stages = await this.funnelStageModelAction.findStagesByFunnelId(selectedFunnel.id);

    const activeStage = stages.find(s => s.status === StageStatus.ACTIVE);

    let currentStage: CurrentStage | null = null;
    if (activeStage) {
      const tasks = await this.stageTaskModelAction.findTasksByStageId(activeStage.id);

      const tasksTotal = tasks.length;
      const tasksComplete = tasks.filter(task => task.is_complete).length;

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