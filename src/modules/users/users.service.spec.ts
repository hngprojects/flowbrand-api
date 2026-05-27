import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  HttpStatus
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import * as SYS_MSG from '../../constants/system.messages';
import { UserModelAction } from './actions/user.action';
import { UsersService } from './users.service';
import { WizardSessionModelAction } from './../onboarding/actions/wizard-session.action';
import { FunnelModelAction } from './../funnels/actions/funnel.action';
import { FunnelStageModelAction } from './../funnels/actions/funnel-stage.action';
import { StageTaskModelAction } from './../funnels/actions/stage-task.action';
import { RedisService } from './../redis/redis.service';
import { WizardStatus } from './../onboarding/enums/wizzard-status.enum';
import { FunnelStatus } from './../funnels/enums/funnel-status.enum';
import { StageStatus } from './../funnels/enums/stage-status.enum';
import { User } from './entities/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

const USER_ID = 'user-uuid-001';
const USER_EMAIL = 'test@example.com';

// Mock UserModelAction
const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

// Mock WizardSessionModelAction
const mockWizardSessionModelAction = {
  findActiveSession: jest.fn(),
  findSessionById: jest.fn(),
  saveSession: jest.fn(),
  markAsExpired: jest.fn(),
  resolveStartWizardSession: jest.fn(),
};

// Mock FunnelModelAction
const mockFunnelModelAction = {
  findFunnelsByUserId: jest.fn(),
  findByIdempotency: jest.fn(),
  findGeneratingForUser: jest.fn(),
  findOwnedById: jest.fn(),
};

// Mock FunnelStageModelAction
const mockFunnelStageModelAction = {
  findStagesByFunnelId: jest.fn(),
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

const mockUser = (): Partial<User> => ({ 
  id: USER_ID, 
  email: USER_EMAIL, 
  full_name: 'Test User' 
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

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: WizardSessionModelAction, useValue: mockWizardSessionModelAction },
        { provide: FunnelModelAction, useValue: mockFunnelModelAction },
        { provide: FunnelStageModelAction, useValue: mockFunnelStageModelAction },
        { provide: StageTaskModelAction, useValue: mockStageTaskModelAction },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    // Default Redis behavior
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);
    mockRedisService.del.mockResolvedValue(undefined);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CRUD TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      email: USER_EMAIL,
      password: 'Password123!',
      fullName: 'Test User',
      termsAccepted: true,
    };

    it('AC-01: creates a user and returns the created user', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(mockUser());

      const result = await service.create(createDto);

      expect(mockUserModelAction.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(result).toEqual(mockUser());
    });

    it('AC-02: throws 409 when email already exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser());

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
      expect(mockUserModelAction.create).not.toHaveBeenCalled();
    });

    it('AC-03: throws 409 with USER_ACCOUNT_LOCKED when account is inactive', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue({ ...mockUser(), is_active: false });

      await expect(service.create(createDto)).rejects.toThrow(SYS_MSG.USER_ACCOUNT_LOCKED);
    });

    it('AC-04: throws 409 on duplicate key DB error', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      const dbError = Object.assign(new QueryFailedError('', [], new Error()), {
        driverError: { code: '23505' },
      });
      mockUserModelAction.create.mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findById', () => {
    it('AC-05: returns user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());

      const result = await service.findById(USER_ID);

      expect(result).toEqual(mockUser());
      expect(mockUserModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: USER_ID },
      });
    });

    it('AC-06: throws 404 when user not found', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.findById(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('AC-07: returns user when email exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser());

      const result = await service.findByEmail(USER_EMAIL);

      expect(result).toEqual(mockUser());
    });

    it('AC-08: returns null when email does not exist', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const updateDto = { fullName: 'Updated Name' };

    it('AC-09: updates and returns user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.update.mockResolvedValue({ ...mockUser(), full_name: 'Updated Name' });

      const result = await service.update(USER_ID, updateDto);

      expect(result.full_name).toBe('Updated Name');
    });

    it('AC-10: throws 404 when user not found during update', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.update(USER_ID, updateDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('AC-11: hashes password when password is provided in update', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.update.mockResolvedValue(mockUser());

      await service.update(USER_ID, { password: 'NewPass123!' });

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 10);
    });

    it('AC-12: throws 500 when update returns null', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.update.mockResolvedValue(null);

      await expect(service.update(USER_ID, updateDto)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('remove', () => {
    it('AC-13: deletes user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.delete.mockResolvedValue(undefined);

      await expect(service.remove(USER_ID)).resolves.toBeUndefined();
      expect(mockUserModelAction.delete).toHaveBeenCalled();
    });

    it('AC-14: throws 404 when user not found during remove', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.remove(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockUserModelAction.delete).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET USER STATE TESTS (M4-BE-013)
  // ─────────────────────────────────────────────────────────────────────────

  describe('getUserState (M4-BE-013)', () => {
    describe('AC-09 — non-existent user', () => {
      it('throws NotFoundException when userId is not in the database', async () => {
        mockUserModelAction.findById.mockResolvedValue(null);

        await expect(service.getUserState(USER_ID)).rejects.toThrow(NotFoundException);
      });
    });

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
    });

    describe('AC-05 — onboarding never started', () => {
      it('returns status not_started when no wizard_session row exists', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockUser());
        mockWizardSessionModelAction.findActiveSession.mockResolvedValue(null);
        mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([]);

        const result = await service.getUserState(USER_ID);
        expect(result.onboarding).toEqual({ status: 'not_started' });
      });
    });

    describe('AC-04 — onboarding in progress', () => {
      it('returns in_progress with sessionId and stepsCompleted', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockUser());
        mockWizardSessionModelAction.findActiveSession.mockResolvedValue(
          mockSession({ 
            status: WizardStatus.IN_PROGRESS, 
            expires_at: new Date(Date.now() + 3600000), 
            steps_completed: 2 
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

    describe('AC-02 — funnel generating', () => {
      it('returns activeFunnel with status generating and currentStage null', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockUser());
        mockWizardSessionModelAction.findActiveSession.mockResolvedValue(mockSession({ status: WizardStatus.COMPLETE }));
        mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([
          mockFunnel({ status: FunnelStatus.GENERATING })
        ]);

        const result = await service.getUserState(USER_ID);
        expect(result.activeFunnel?.status).toBe('generating');
        expect(result.activeFunnel?.currentStage).toBeNull();
      });
    });

    describe('AC-01 — active funnel with current stage', () => {
      it('returns full stage data including task progress', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockUser());
        mockWizardSessionModelAction.findActiveSession.mockResolvedValue(mockSession({ status: WizardStatus.COMPLETE }));
        mockFunnelModelAction.findFunnelsByUserId.mockResolvedValue([mockFunnel()]);
        mockFunnelStageModelAction.findStagesByFunnelId.mockResolvedValue([mockStage()]);

        const tasks = [mockTask(true), mockTask(true), mockTask(false), mockTask(false)];
        mockStageTaskModelAction.findTasksByStageId.mockResolvedValue(tasks);

        const result = await service.getUserState(USER_ID);
        const stage = result.activeFunnel?.currentStage;

        expect(stage).not.toBeNull();
        expect(stage?.position).toBe(2);
        expect(stage?.tasksTotal).toBe(4);
        expect(stage?.tasksComplete).toBe(2);
      });
    });

    describe('invalidateUserStateCache', () => {
      it('calls redisService.del with the correct scoped key', async () => {
        await service.invalidateUserStateCache(USER_ID);
        expect(mockRedisService.del).toHaveBeenCalledWith(`user-state:${USER_ID}`);
      });
    });

    describe('response envelope shape', () => {
      it('returns data object without wrapper (TransformInterceptor handles envelope)', async () => {
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
});