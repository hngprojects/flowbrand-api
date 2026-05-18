import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../constants/system.messages';
import { WizardSessionModelAction } from './actions/wizard-session.action';
import { WizardSession } from './entities/wizzard-session.entity';
import { WizardStatus } from './enums/wizzard-status.enum';
import { OnboardingService } from './onboarding.service';

// ── Shared constants ──────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// ── Shared helpers ────────────────────────────────────────────────────────────

function buildSession(partial: Partial<WizardSession> = {}): WizardSession {
  const base = {
    id: SESSION_1,
    user_id: USER_A,
    status: WizardStatus.IN_PROGRESS,
    steps_completed: 0,
    answers: {} as Record<string, unknown>,
    expires_at: new Date('2099-06-01T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };
  return { ...base, ...partial } as WizardSession;
}

// ── getOnboardingSession (BE-009) ─────────────────────────────────────────────

const mockSession = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  user_id: 'user-uuid',
  status: WizardStatus.IN_PROGRESS,
  steps_completed: 2,
  answers: { step_1: { name: 'Jane' }, step_2: null },
  expires_at: new Date(Date.now() + 1000 * 60 * 60),
  created_at: new Date(),
  updated_at: new Date(),
};

const mockAction = {
  findActiveSession: jest.fn(),
  markAsExpired: jest.fn(),
  resolveStartWizardSession: jest.fn(),
};

describe('OnboardingService — getOnboardingSession (BE-009)', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: WizardSessionModelAction, useValue: mockAction },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('AC-03: should throw NotFoundException when no session exists', async () => {
    mockAction.findActiveSession.mockResolvedValue(null);
    await expect(service.getOnboardingSession('user-uuid')).rejects.toThrow(NotFoundException);
  });

  it('AC-04: should mark session as expired and throw NotFoundException', async () => {
    mockAction.findActiveSession.mockResolvedValue({
      ...mockSession,
      expires_at: new Date(Date.now() - 1000),
    });
    mockAction.markAsExpired.mockResolvedValue(undefined);
    await expect(service.getOnboardingSession('user-uuid')).rejects.toThrow(NotFoundException);
    expect(mockAction.markAsExpired).toHaveBeenCalledWith(mockSession.id);
  });

  it('AC-01: should return session with cleaned answers', async () => {
    mockAction.findActiveSession.mockResolvedValue(mockSession);
    const result = await service.getOnboardingSession('user-uuid');
    expect(result.answers).toEqual({ step_1: { name: 'Jane' } });
    expect(result.answers).not.toHaveProperty('step_2');
  });

  it('AC-02: should omit null answer keys', async () => {
    mockAction.findActiveSession.mockResolvedValue(mockSession);
    const result = await service.getOnboardingSession('user-uuid');
    expect(Object.values(result.answers).every(v => v !== null)).toBe(true);
  });
});

// ── startWizardSession (BE-007) ───────────────────────────────────────────────

const mockWizardSessionModelAction = {
  resolveStartWizardSession: jest.fn(),
  findActiveSession: jest.fn(),
  markAsExpired: jest.fn(),
};

describe('OnboardingService — startWizardSession (edge cases)', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: WizardSessionModelAction,
          useValue: mockWizardSessionModelAction,
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('throws 409 when user already has a completed wizard session', async () => {
    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'already_complete',
    });

    let caught: unknown;
    try {
      await service.startWizardSession(USER_A);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
    });
  });

  it('returns existing active in-progress session without creating (idempotent)', async () => {
    const existing = buildSession({
      id: SESSION_1,
      user_id: USER_A,
      steps_completed: 2,
      answers: { step_1: { x: 1 }, step_2: { y: 2 } },
    });

    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'active',
      session: existing,
    });

    const result = await service.startWizardSession(USER_A);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.message).toBe(SYS_MSG.ONBOARDING_SESSION_RESUMED);
    expect(result.data).toEqual({
      session_id: SESSION_1,
      user_id: USER_A,
      status: WizardStatus.IN_PROGRESS,
      steps_completed: 2,
      answers: { step_1: { x: 1 }, step_2: { y: 2 } },
      expires_at: existing.expires_at,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    });
  });

  it('creates a new session when none completed and no non-expired active session', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T10:00:00.000Z'));
    try {
      const created = buildSession({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        user_id: USER_A,
        expires_at: new Date('2026-05-16T10:00:00.000Z'),
      });

      mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
        status: 'created',
        session: created,
      });

      const result = await service.startWizardSession(USER_A);

      expect(
        mockWizardSessionModelAction.resolveStartWizardSession,
      ).toHaveBeenCalledWith(
        USER_A,
        new Date('2026-05-15T10:00:00.000Z'),
        new Date('2026-05-16T10:00:00.000Z'),
      );

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.message).toBe(SYS_MSG.ONBOARDING_SESSION_STARTED);
      expect(result.data.session_id).toBe(created.id);
      expect(result.data.user_id).toBe(USER_A);
      expect(result.data.status).toBe(WizardStatus.IN_PROGRESS);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns created session when only expired in-progress exists (resolved in DB layer)', async () => {
    const created = buildSession({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'created',
      session: created,
    });

    await service.startWizardSession(USER_A);

    expect(
      mockWizardSessionModelAction.resolveStartWizardSession,
    ).toHaveBeenCalledWith(USER_A, expect.any(Date), expect.any(Date));
  });

  it('isolates users: completed for user A does not block user B', async () => {
    mockWizardSessionModelAction.resolveStartWizardSession.mockImplementation(
      async (userId: string) => {
        if (userId === USER_A) {
          return { status: 'already_complete' };
        }
        return {
          status: 'created',
          session: buildSession({ id: 'new-for-b', user_id: USER_B }),
        };
      },
    );

    await expect(service.startWizardSession(USER_A)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const result = await service.startWizardSession(USER_B);
    expect(result.statusCode).toBe(HttpStatus.CREATED);
    expect(result.data.user_id).toBe(USER_B);
  });

  it('delegates to atomic resolveStartWizardSession', async () => {
    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'created',
      session: buildSession(),
    });

    await service.startWizardSession(USER_A);

    expect(
      mockWizardSessionModelAction.resolveStartWizardSession,
    ).toHaveBeenCalledTimes(1);
  });

  it('maps entity id to response session_id (no duplicate id field)', async () => {
    const existing = buildSession({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'active',
      session: existing,
    });

    const result = await service.startWizardSession(USER_A);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.data.session_id).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect('id' in result.data).toBe(false);
  });
});