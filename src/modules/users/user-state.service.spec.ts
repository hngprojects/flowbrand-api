import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserStateService } from './user-state.service';
import { UserModelAction } from './actions/user.action';
import { WizardSessionModelAction } from '../onboarding/actions/wizard-session.action';
import { FunnelModelAction } from './../funnels/actions/funnel.action';
import { FunnelStageModelAction } from './../funnels/actions/funnel-stage.action';
import { StageTaskModelAction } from './../funnels/actions/stage-task.action';
import { RedisService } from './../redis/redis.service';
import { WizardStatus } from './../onboarding/enums/wizzard-status.enum';
import { FunnelStatus } from './../funnels/enums/funnel-status.enum';
import { StageStatus } from './../funnels/enums/stage-status.enum';
import * as SYS_MSG from '../../constants/system.messages';

const USER_ID = 'user-uuid-001';

// Mock UserModelAction
const mockUserModelAction = {
  findById: jest.fn(),
};

// Mock WizardSessionModelAction
const mockWizardSessionModelAction = {
  findActiveSession: jest.fn(),
};

// Mock FunnelModelAction
const mockFunnelModelAction = {
  findFunnelsByUserId: jest.fn(),
};

// Mock FunnelStageModelAction
const mockFunnelStageModelAction = {
  getStagesByFunnelId: jest.fn(),
};

// Mock StageTaskModelAction
const mockStageTaskModelAction = {
  findTasksByStageId: jest.fn(),
};

// Mock RedisService
const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockUser = (): Partial<any> => ({
  id: USER_ID,
  email: 'test@example.com',
  full_name: 'Test User',
});

const mockSession = (overrides: Partial<any> = {}): any => ({
  id: 'session-uuid-001',
  status: WizardStatus.COMPLETE,
  expires_at: new Date(Date.now() + 3_600_000),
  steps_completed: 3,
  ...overrides,
});

const mockFunnel = (overrides: Partial<any> = {}): any => ({
  id: 'funnel-uuid-001',
  business_name: 'My Business',
  status: FunnelStatus.ACTIVE,
  created_at: new Date('2026-01-01'),
  ...overrides,
});

const mockStage = (overrides: Partial<any> = {}): any => ({
  id: 'stage-uuid-001',
  position: 2,
  name: 'Spark Interest',
  status: StageStatus.ACTIVE,
  unlocked_at: new Date('2026-01-02'),
  ...overrides,
});

const mockTask = (isComplete: boolean): any => ({
  id: `task-uuid-${Math.random()}`,
  is_complete: isComplete,
});

describe('UserStateService', () => {
  let service: UserStateService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserStateService,
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: WizardSessionModelAction, useValue: mockWizardSessionModelAction },
        { provide: FunnelModelAction, useValue: mockFunnelModelAction },
        { provide: FunnelStageModelAction, useValue: mockFunnelStageModelAction },
        { provide: StageTaskModelAction, useValue: mockStageTaskModelAction },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<UserStateService>(UserStateService);

    // Default Redis behavior
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);
    mockRedisService.del.mockResolvedValue(undefined);
  });

  // ─── AC-09: Non-existent user ─────────────────────────────────────────────

  describe('AC-09 — non-existent user', () => {
    it('throws NotFoundException when userId is not in the database', async () => {
      mockUserModelAction.findById.mockResolvedValue(null);

      await expect(service.getUserState(USER_ID)).rejects.toThrow(NotFoundException);
      await expect(service.getUserState(USER_ID)).rejects.toThrow(SYS_MSG.USER_NOT_FOUND_BY_TOKEN);
    });
  });

  // ─── AC-11: Redis cache ───────────────────────────────────────────────────

  describe('AC-11 — Redis cache', () => {
    it('returns cached response without hitting the database', async () => {
      const cached = {
        onboarding: { status: 'complete' },
        activeFunnel: null,
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getUserState(USER_ID);

      expect(result).toEqual(cached);
      expect(mockWizardSessionModelAction.findActiveSession).not.toHaveBeenCalled();
      expect(mockFunnelModelAction.findFunnelsByUserId).not.toHaveBeenCalled();
    });

    it('deletes corrupted cache and continues to fresh computation', async () => {
      mockRedisService.get.mockResolvedValue('invalid-json{');
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(null);
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      await service.getUserState(USER_ID);

      expect(mockRedisService.del).toHaveBeenCalledWith(`user-state:${USER_ID}`);
      expect(mockWizardSessionModelAction.findActiveSession).toHaveBeenCalled();
    });

    it('writes the fresh response to Redis with 20s TTL on a cache miss', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(null);
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      await service.getUserState(USER_ID);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `user-state:${USER_ID}`,
        expect.any(String),
        20
      );
    });

    it('cache key is scoped to userId (SEC-04)', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(null);
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      await service.getUserState(USER_ID);

      const [keyArg] = mockRedisService.set.mock.calls[0];
      expect(keyArg).toBe(`user-state:${USER_ID}`);
      expect(keyArg).not.toBe('user-state:');
      expect(keyArg).toContain(USER_ID);
    });
  });

  // ─── AC-05: Onboarding never started ──────────────────────────────────────

  describe('AC-05 — onboarding never started', () => {
    it('returns status not_started when no wizard_session row exists', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(null);
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.onboarding).toEqual({ status: 'not_started' });
    });
  });

  // ─── AC-04: Onboarding in progress ────────────────────────────────────────

  describe('AC-04 — onboarding in progress', () => {
    it('returns in_progress with sessionId and stepsCompleted', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({
          status: WizardStatus.IN_PROGRESS,
          expires_at: new Date(Date.now() + 3_600_000),
          steps_completed: 2,
        })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.onboarding).toEqual({
        status: 'in_progress',
        sessionId: 'session-uuid-001',
        stepsCompleted: 2,
      });
    });
  });

  // ─── EC-02: Expired onboarding session ────────────────────────────────────

  describe('EC-02 — expired onboarding session', () => {
    it('treats an expired IN_PROGRESS session as not_started', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({
          status: WizardStatus.IN_PROGRESS,
          expires_at: new Date(Date.now() - 1_000), // expired
          steps_completed: 2,
        })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.onboarding.status).toBe('not_started');
      expect(result.onboarding.sessionId).toBeUndefined();
    });
  });

  // ─── Onboarding complete ──────────────────────────────────────────────────

  describe('onboarding complete', () => {
    it('returns status complete with no sessionId or stepsCompleted', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.onboarding).toEqual({ status: 'complete' });
      expect(result.onboarding.sessionId).toBeUndefined();
    });
  });

  // ─── AC-03: No funnel yet ─────────────────────────────────────────────────

  describe('AC-03 — no funnel yet', () => {
    it('returns activeFunnel null when user has no non-failed funnels', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.activeFunnel).toBeNull();
    });
  });

  // ─── AC-06: Only failed funnels ───────────────────────────────────────────

  describe('AC-06 — only failed funnels', () => {
    it('returns activeFunnel null when the only funnel has status failed', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([
        mockFunnel({ status: FunnelStatus.FAILED }),
      ]);

      const result = await service.getUserState(USER_ID);

      expect(result.activeFunnel).toBeNull();
    });
  });

  // ─── AC-02: Funnel generating ─────────────────────────────────────────────

  describe('AC-02 — funnel generating', () => {
    it('returns activeFunnel with status generating and currentStage null', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([
        mockFunnel({ status: FunnelStatus.GENERATING }),
      ]);

      const result = await service.getUserState(USER_ID);

      expect(result.activeFunnel?.status).toBe('generating');
      expect(result.activeFunnel?.currentStage).toBeNull();
      expect(mockFunnelStageModelAction.getStagesByFunnelId).not.toHaveBeenCalled();
    });
  });

  // ─── AC-01: Active funnel with current stage ──────────────────────────────

  describe('AC-01 — active funnel with current stage', () => {
    it('returns full stage data including task progress', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([mockFunnel()]);
      mockFunnelStageModelAction.getStagesByFunnelId.mockResolvedValue([mockStage()]);

      const tasks = [mockTask(true), mockTask(true), mockTask(false), mockTask(false)];
      mockStageTaskModelAction.findTasksByStageId.mockResolvedValue(tasks);

      const result = await service.getUserState(USER_ID);
      const stage = result.activeFunnel?.currentStage;

      expect(stage).not.toBeNull();
      expect(stage?.position).toBe(2);
      expect(stage?.name).toBe('Spark Interest');
      expect(stage?.tasksTotal).toBe(4);
      expect(stage?.tasksComplete).toBe(2);
    });
  });

  // ─── AC-07: All stages complete ───────────────────────────────────────────

  describe('AC-07 — all stages complete', () => {
    it('returns currentStage null when no stage has status ACTIVE', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([mockFunnel()]);
      mockFunnelStageModelAction.getStagesByFunnelId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.activeFunnel?.status).toBe('active');
      expect(result.activeFunnel?.currentStage).toBeNull();
    });
  });

  // ─── EC-03: Active funnel but no stages generated ─────────────────────────

  describe('EC-03 — active funnel but no stages generated', () => {
    it('returns currentStage null when funnel is active but has no stage rows', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([mockFunnel()]);
      mockFunnelStageModelAction.getStagesByFunnelId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result.activeFunnel?.currentStage).toBeNull();
      expect(mockStageTaskModelAction.findTasksByStageId).not.toHaveBeenCalled();
    });
  });

  // ─── EC-01: Active funnel wins over generating ────────────────────────────

  describe('EC-01 — active funnel wins over generating', () => {
    it('returns the active funnel even when a newer generating funnel exists', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([
        mockFunnel({
          id: 'funnel-generating',
          status: FunnelStatus.GENERATING,
          created_at: new Date('2026-02-01'), // newer
        }),
        mockFunnel({
          id: 'funnel-active',
          status: FunnelStatus.ACTIVE,
          created_at: new Date('2026-01-01'), // older
        }),
      ]);
      mockFunnelStageModelAction.getStagesByFunnelId.mockResolvedValue([mockStage()]);

      const tasks = [mockTask(true), mockTask(false)];
      mockStageTaskModelAction.findTasksByStageId.mockResolvedValue(tasks);

      const result = await service.getUserState(USER_ID);

      expect(result.activeFunnel?.funnelId).toBe('funnel-active');
      expect(result.activeFunnel?.status).toBe('active');
    });
  });

  // ─── AC-10: Idempotency ───────────────────────────────────────────────────

  describe('AC-10 — idempotency', () => {
    it('produces identical responses on repeated calls with no state mutations', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
        mockSession({ status: WizardStatus.COMPLETE })
      );
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([mockFunnel()]);
      mockFunnelStageModelAction.getStagesByFunnelId.mockResolvedValue([mockStage()]);

      const tasks = [mockTask(true), mockTask(false)];
      mockStageTaskModelAction.findTasksByStageId.mockResolvedValue(tasks);

      // First call — cache miss
      mockRedisService.get.mockResolvedValueOnce(null);
      const first = await service.getUserState(USER_ID);

      // Second call — cache hit
      const cachedJson = JSON.stringify(first);
      mockRedisService.get.mockResolvedValueOnce(cachedJson);
      const second = await service.getUserState(USER_ID);

      // Compare serialized versions to handle Date -> string conversion
      expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(second)));
    });
  });

  // ─── invalidateUserStateCache ─────────────────────────────────────────────

  describe('invalidateUserStateCache', () => {
    it('calls redisService.del with the correct scoped key', async () => {
      await service.invalidateUserStateCache(USER_ID);
      expect(mockRedisService.del).toHaveBeenCalledWith(`user-state:${USER_ID}`);
    });
  });

  // ─── Response shape ───────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns only data object without wrapper (TransformInterceptor handles envelope)', async () => {
      mockUserModelAction.findById.mockResolvedValue(mockUser());
      mockWizardSessionModelAction.findActiveSession.mockResolvedValue(null);
      mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

      const result = await service.getUserState(USER_ID);

      expect(result).toHaveProperty('onboarding');
      expect(result).toHaveProperty('activeFunnel');
      expect(result).not.toHaveProperty('success');
      expect(result).not.toHaveProperty('statusCode');
      expect(result).not.toHaveProperty('message');
    });
  });
});