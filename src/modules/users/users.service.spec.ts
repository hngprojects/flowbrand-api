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
import { WizardSession } from '../onboarding/entities/wizzard-session.entity';
import { Funnel } from '../funnels/entities/funnel.entity';
import { FunnelStage } from '../funnels/entities/funnel-stage.entity';
import { StageTask } from '../funnels/entities/stage-task.entity';
import { RedisService } from '../redis/redis.service';
import { WizardStatus } from '../onboarding/enums/wizzard-status.enum';
import { FunnelStatus } from '../funnels/enums/funnel-status.enum';
import { StageStatus } from '../funnels/enums/stage-status.enum';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

const USER_ID = 'user-uuid-001';
const USER_EMAIL = 'test@example.com';

// Shared mock for UserModelAction (used by both test suites)
const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

// Mock user object
const mockUser = (): Partial<User> => ({ id: USER_ID, email: USER_EMAIL, full_name: 'Test User' });

// Helper functions
const mockSession = (overrides: Partial<WizardSession> = {}): Partial<WizardSession> => ({
  id: 'session-uuid-001',
  status: WizardStatus.COMPLETE,
  expires_at: new Date(Date.now() + 3_600_000),
  steps_completed: 3,
  ...overrides,
});

const mockFunnel = (overrides: Partial<Funnel> = {}): Partial<Funnel> => ({
  id: 'funnel-uuid-001',
  business_name: 'My Business',
  status: FunnelStatus.ACTIVE,
  created_at: new Date('2026-01-01'),
  ...overrides,
});

const mockStage = (overrides: Partial<FunnelStage> = {}): Partial<FunnelStage> => ({
  id: 'stage-uuid-001',
  position: 2,
  name: 'Spark Interest',
  status: StageStatus.ACTIVE,
  unlocked_at: new Date('2026-01-02'),
  ...overrides,
});

const mockTask = (isComplete: boolean): Partial<StageTask> => ({
  id: `task-uuid-${Math.random()}`,
  is_complete: isComplete,
});

function makeQB<T extends Record<string, unknown>>(returnValue: T | T[] | null): Partial<SelectQueryBuilder<T>> {
  const qb: Partial<SelectQueryBuilder<T>> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(returnValue),
    getMany: jest.fn().mockResolvedValue(Array.isArray(returnValue) ? returnValue : []),
  };
  return qb;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE TEST MODULE FOR ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('UsersService', () => {
  let service: UsersService;
  let userRepo: jest.Mocked<Repository<User>>;
  let wizardSessionRepo: jest.Mocked<Repository<WizardSession>>;
  let funnelRepo: jest.Mocked<Repository<Funnel>>;
  let stageRepo: jest.Mocked<Repository<FunnelStage>>;
  let taskRepo: jest.Mocked<Repository<StageTask>>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        // Provide ALL dependencies
        { provide: UserModelAction, useValue: mockUserModelAction },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn(), createQueryBuilder: jest.fn(), save: jest.fn(), update: jest.fn(), softDelete: jest.fn() },
        },
        {
          provide: getRepositoryToken(WizardSession),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Funnel),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(FunnelStage),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(StageTask),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
    wizardSessionRepo = module.get(getRepositoryToken(WizardSession));
    funnelRepo = module.get(getRepositoryToken(Funnel));
    stageRepo = module.get(getRepositoryToken(FunnelStage));
    taskRepo = module.get(getRepositoryToken(StageTask));
    redisService = module.get(RedisService);

    // Default Redis behavior
    redisService.get.mockResolvedValue(null);
    redisService.set.mockResolvedValue(undefined);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CRUD TESTS (Original tests from first describe block)
  // Note: These tests need to be updated to use userRepo where appropriate
  // or kept as-is but with proper mocks
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
        userRepo.findOne.mockResolvedValue(null);
        await expect(service.getUserState(USER_ID)).rejects.toThrow(NotFoundException);
      });
    });

    describe('AC-11 — Redis cache', () => {
      it('returns cached response without hitting the database', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);

        const cached = {
          success: true,
          statusCode: 200,
          message: 'User state retrieved successfully',
          data: { onboarding: { status: 'complete' }, activeFunnel: null },
        };
        redisService.get.mockResolvedValue(JSON.stringify(cached));

        const result = await service.getUserState(USER_ID);

        expect(result).toEqual(cached);
        expect(wizardSessionRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(funnelRepo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('writes the fresh response to Redis with 20s TTL on a cache miss', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);
        wizardSessionRepo.createQueryBuilder.mockReturnValue(makeQB(mockSession()) as any);
        funnelRepo.createQueryBuilder.mockReturnValue(makeQB([]) as any);

        await service.getUserState(USER_ID);

        expect(redisService.set).toHaveBeenCalledWith(`user-state:${USER_ID}`, expect.any(String), 20);
      });
    });

    describe('AC-05 — onboarding never started', () => {
      it('returns status not_started when no wizard_session row exists', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);
        wizardSessionRepo.createQueryBuilder.mockReturnValue(makeQB(null) as any);
        funnelRepo.createQueryBuilder.mockReturnValue(makeQB([]) as any);

        const result = await service.getUserState(USER_ID);
        expect(result.data.onboarding).toEqual({ status: 'not_started' });
      });
    });

    describe('AC-04 — onboarding in progress', () => {
      it('returns in_progress with sessionId and stepsCompleted', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);
        wizardSessionRepo.createQueryBuilder.mockReturnValue(
          makeQB(mockSession({ status: WizardStatus.IN_PROGRESS, expires_at: new Date(Date.now() + 3600000), steps_completed: 2 })) as any,
        );
        funnelRepo.createQueryBuilder.mockReturnValue(makeQB([]) as any);

        const result = await service.getUserState(USER_ID);
        expect(result.data.onboarding).toEqual({
          status: 'in_progress',
          sessionId: 'session-uuid-001',
          stepsCompleted: 2,
        });
      });
    });

    describe('AC-02 — funnel generating', () => {
      it('returns activeFunnel with status generating and currentStage null', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);
        wizardSessionRepo.createQueryBuilder.mockReturnValue(makeQB(mockSession()) as any);
        funnelRepo.createQueryBuilder.mockReturnValue(makeQB([mockFunnel({ status: FunnelStatus.GENERATING })]) as any);

        const result = await service.getUserState(USER_ID);
        expect(result.data.activeFunnel?.status).toBe('generating');
        expect(result.data.activeFunnel?.currentStage).toBeNull();
      });
    });

    describe('AC-01 — active funnel with current stage', () => {
      it('returns full stage data including task progress', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);
        wizardSessionRepo.createQueryBuilder.mockReturnValue(makeQB(mockSession()) as any);
        funnelRepo.createQueryBuilder.mockReturnValue(makeQB([mockFunnel()]) as any);
        stageRepo.createQueryBuilder.mockReturnValue(makeQB(mockStage()) as any);

        const tasks = [mockTask(true), mockTask(true), mockTask(false), mockTask(false)];
        const taskQB = makeQB(tasks);
        taskQB.getMany = jest.fn().mockResolvedValue(tasks);
        taskRepo.createQueryBuilder.mockReturnValue(taskQB as any);

        const result = await service.getUserState(USER_ID);
        const stage = result.data.activeFunnel?.currentStage;

        expect(stage).not.toBeNull();
        expect(stage?.position).toBe(2);
        expect(stage?.tasksTotal).toBe(4);
        expect(stage?.tasksComplete).toBe(2);
      });
    });

    describe('invalidateUserStateCache', () => {
      it('calls redisService.del with the correct scoped key', async () => {
        await service.invalidateUserStateCache(USER_ID);
        expect(redisService.del).toHaveBeenCalledWith(`user-state:${USER_ID}`);
      });
    });

    describe('response envelope shape', () => {
      it('always wraps data in the standard success envelope', async () => {
        userRepo.findOne.mockResolvedValue(mockUser() as User);
        wizardSessionRepo.createQueryBuilder.mockReturnValue(makeQB(mockSession()) as any);
        funnelRepo.createQueryBuilder.mockReturnValue(makeQB([]) as any);

        const result = await service.getUserState(USER_ID);
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(HttpStatus.OK);
        expect(result.message).toBeDefined();
        expect(result.data).toHaveProperty('onboarding');
        expect(result.data).toHaveProperty('activeFunnel');
      });
    });
  });
});