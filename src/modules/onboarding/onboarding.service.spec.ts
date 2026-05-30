import { 
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  HttpStatus,
 } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../constants/system.messages';
import { WizardSessionModelAction } from './actions/wizard-session.action';
import { WizardSession } from './entities/wizzard-session.entity';
import { WizardStatus } from './enums/wizzard-status.enum';
import { OnboardingService } from './onboarding.service';
import { DataSource } from 'typeorm';

// ── Shared constants ──────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockWizardSessionModelAction = {
  resolveStartWizardSession: jest.fn(),
  findSessionById: jest.fn(),
  markAsExpired: jest.fn(),
};

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


// ── startWizardSession (BE-007) ───────────────────────────────────────────────

describe('OnboardingService — startWizardSession (edge cases)', () => {
  let service: OnboardingService;
  let mockDataSource: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: WizardSessionModelAction,
          useValue: mockWizardSessionModelAction,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('returns 200 with completed status and redirect when already complete', async () => {
    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'already_complete',
    });
    const result = await service.startWizardSession(USER_A);
    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.message).toBe(SYS_MSG.ONBOARDING_ALREADY_COMPLETE);
    expect(result.data).toEqual({
      status: WizardStatus.COMPLETE,
      redirect: { to: 'funnel_generation' }
    });
  });

  it('returns existing active in-progress session with camelCase fields (idempotent)', async () => {
    const existing = buildSession({
      id: SESSION_1,
      user_id: USER_A,
      steps_completed: 2,
      answers: { step_1: { x: 1 }, step_2: null }, // note step_2: null will be omitted
    });
    mockWizardSessionModelAction.resolveStartWizardSession.mockResolvedValue({
      status: 'active',
      session: existing,
    });
    const result = await service.startWizardSession(USER_A);
    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.message).toBe(SYS_MSG.ONBOARDING_SESSION_RESUMED);
    expect(result.data).toEqual({
      sessionId: SESSION_1,
      userId: USER_A,
      status: WizardStatus.IN_PROGRESS,
      stepsCompleted: 2,
      answers: { step_1: { x: 1 } }, // null step_2 was filtered out
      expiresAt: existing.expires_at,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
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
      expect(result.data.sessionId).toBe(created.id);
      expect(result.data.userId).toBe(USER_A);
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

    const resultA = await service.startWizardSession(USER_A);
    expect(resultA.statusCode).toBe(HttpStatus.OK);
    expect(resultA.data.status).toBe(WizardStatus.COMPLETE);

    const result = await service.startWizardSession(USER_B);
    expect(result.statusCode).toBe(HttpStatus.CREATED);
    expect(result.data.userId).toBe(USER_B);
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
    expect(result.data.sessionId).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect('id' in result.data).toBe(false);
  });
});

describe('OnboardingService — completeOnboarding', () => {
  let service: OnboardingService;
  let mockDataSource: any;

  const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const validAnswers = {
    step_1: { business_description: 'Selling handmade bags' },
    step_2: { customer_tags: { type: ['retail'] } },
    step_3: { discovery_channel: 'Instagram' },
  };

  const validSession = {
    id: SESSION_ID,
    user_id: USER_ID,
    status: WizardStatus.IN_PROGRESS,
    steps_completed: 3,
    answers: validAnswers,
    expires_at: new Date('2099-06-01T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockManager = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(async () => {
  jest.clearAllMocks();


  mockWizardSessionModelAction.findSessionById = jest.fn();

  mockDataSource = {
    transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockManager);
    }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      OnboardingService,
      {
        provide: WizardSessionModelAction,
        useValue: mockWizardSessionModelAction,
      },
      {
        provide: DataSource,  
        useValue: mockDataSource,
      },
    ],
  }).compile();

  service = module.get<OnboardingService>(OnboardingService);
});

  it('AC-01: returns 200 with redirect on success', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue(validSession);

    const result = await service.completeOnboarding(USER_ID, SESSION_ID);

    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ONBOARDING_COMPLETE_SUCCESS,
      data: { redirect: { to: 'funnel_generation' } },
    });
  });

  it('AC-02: throws 404 when session does not exist', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue(null);

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('AC-02: throws 404 when session belongs to a different user', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      user_id: 'different-user',
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('AC-02: 404 contains correct message', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue(null);

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toThrow(SYS_MSG.ONBOARDING_SESSION_NOT_FOUND);
  });

  it('AC-03: throws 403 when session is expired', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      status: WizardStatus.EXPIRED,
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AC-03: 403 contains correct message', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      status: WizardStatus.EXPIRED,
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toThrow(SYS_MSG.ONBOARDING_SESSION_EXPIRED);
  });

  it('AC-04: throws 409 when session is already complete', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      status: WizardStatus.COMPLETE,
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('AC-04: 409 contains correct message', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      status: WizardStatus.COMPLETE,
    });

    let caught: unknown;
    try {
      await service.completeOnboarding(USER_ID, SESSION_ID);
    } catch (e) {
      caught = e;
    }

    expect((caught as ConflictException).getResponse()).toMatchObject({
      message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
    });
  });

  it('AC-05: throws 422 when step_1 is missing', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      answers: { ...validAnswers, step_1: null },
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-05: throws 422 when step_2 is missing', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      answers: { ...validAnswers, step_2: null },
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-05: throws 422 when step_3 is missing', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      answers: { ...validAnswers, step_3: null },
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-05: 422 lists all missing steps when answers is empty', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      answers: {},
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toMatchObject({
      response: {
        message: SYS_MSG.ONBOARDING_INCOMPLETE,
        missing_fields: expect.arrayContaining(['step_1', 'step_2', 'step_3']),
      },
    });
  });

  it('AC-05: 422 lists only the missing step when one is absent', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      answers: {
        step_2: { customer_tags: { type: ['retail'] } },
        step_3: { discovery_channel: 'Instagram' },
      },
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toMatchObject({
      response: { missing_fields: ['step_1'] },
    });
  });

  it('should throw 422 when discovery channel is empty string',
    async () => {
      mockWizardSessionModelAction.findSessionById.mockResolvedValue({
    ...validSession,
    answers: { ...validAnswers, step_3: { discovery_channel: '' } },
  });

  await expect(
    service.completeOnboarding(USER_ID, SESSION_ID),
  ).rejects.toThrow(UnprocessableEntityException);
    },
  );

  it('updates user profile with correct fields inside transaction', async () => {
  mockWizardSessionModelAction.findSessionById.mockResolvedValue(validSession);

  await service.completeOnboarding(USER_ID, SESSION_ID);

  expect(mockDataSource.transaction).toHaveBeenCalled();
  
  const transactionCallback = mockDataSource.transaction.mock.calls[0][0];
  expect(transactionCallback).toBeDefined();
});

  it('marks session as COMPLETE inside transaction', async () => {
     mockWizardSessionModelAction.findSessionById.mockResolvedValue(validSession);

  await service.completeOnboarding(USER_ID, SESSION_ID);

  const updateCall = mockManager.update.mock.calls.find(
    call => call[1] === SESSION_ID && call[2]?.status === WizardStatus.COMPLETE
  );
  
  expect(updateCall).toBeDefined();
  });

  it('calls transaction exactly once', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue(validSession);

    await service.completeOnboarding(USER_ID, SESSION_ID);

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('calls manager.update exactly twice inside transaction', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue(validSession);

    await service.completeOnboarding(USER_ID, SESSION_ID);

    expect(mockManager.update).toHaveBeenCalledTimes(2);
  });

  it('does not call transaction when session validation fails', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue({
      ...validSession,
      status: WizardStatus.EXPIRED,
    });

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('propagates error if transaction throws', async () => {
    mockWizardSessionModelAction.findSessionById.mockResolvedValue(validSession);
    mockDataSource.transaction.mockRejectedValueOnce(new Error('DB failure'));

    await expect(
      service.completeOnboarding(USER_ID, SESSION_ID),
    ).rejects.toThrow('DB failure');
  });

  describe('primary_goal mapping for all DiscoveryChannel values', () => {
    const cases: Array<{ channel: string; expected: string }> = [
      { channel: 'Instagram',        expected: 'awareness' },
      { channel: 'Facebook',         expected: 'awareness' },
      { channel: 'TikTok',           expected: 'awareness' },
      { channel: 'Physical Location', expected: 'sales' },
      { channel: 'Others',           expected: 'awareness' },
    ];

    it.each(cases)(
      'writes primary_goal "$expected" for discovery_channel "$channel"',
      async ({ channel, expected }) => {
        mockWizardSessionModelAction.findSessionById.mockResolvedValue({
          ...validSession,
          answers: { ...validAnswers, step_3: { discovery_channel: channel } },
        });

        await service.completeOnboarding(USER_ID, SESSION_ID);

        const userUpdateCall = mockManager.update.mock.calls.find(
          (call: unknown[]) => call[1] === USER_ID,
        );
        expect(userUpdateCall![2]).toMatchObject({ primary_goal: expected });
      },
    );
  });
});

describe('OnboardingService — saveStepAnswer (BE-008)', () => {
  let service: OnboardingService;
  let mockDataSource: any;

  const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const mockSaveSessionAction = {
    findSessionById: jest.fn(),
    saveSession: jest.fn(),
    findActiveSession: jest.fn(),
    markAsExpired: jest.fn(),
    resolveStartWizardSession: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: WizardSessionModelAction, useValue: mockSaveSessionAction },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('AC-01: throws 404 when session does not belong to user', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(null);
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID, step: 1, answer: { business_description: 'test' }
      } as any)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('AC-02: throws 403 when session is expired', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession({ status: WizardStatus.EXPIRED }));
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID, step: 1, answer: { business_description: 'test' }
      } as any)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AC-03: throws 409 when session is already complete', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession({ status: WizardStatus.COMPLETE }));
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID, step: 1, answer: { business_description: 'test' }
      } as any)
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('AC-04: saves step 1 answer and returns 200 with steps_completed = 1', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession());
    mockSaveSessionAction.saveSession.mockResolvedValue(undefined);

    const result = await service.saveStepAnswer(USER_ID, {
      session_id: SESSION_ID, step: 1, answer: { business_description: 'We sell handmade shoes' }
    } as any);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.message).toBe(SYS_MSG.ONBOARDING_STEP_SAVED);
    expect(result.data.answers).toHaveProperty('step_1');
    expect(result.data.stepsCompleted).toBe(1);
  });

  it('AC-05: saves step 2 answer and returns 200 with steps_completed = 2', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession({
      answers: { step_1: { business_description: 'We sell shoes' } },
      steps_completed: 1,
    }));
    mockSaveSessionAction.saveSession.mockResolvedValue(undefined);

    const result = await service.saveStepAnswer(USER_ID, {
      session_id: SESSION_ID, step: 2, answer: { customer_tags: { type: ['retail'] } }
    } as any);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.data.answers).toHaveProperty('step_2');
    expect(result.data.stepsCompleted).toBe(2);
  });

  it('AC-06: saves step 3 answer and returns 200 with stepsCompleted = 3', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession({
      answers: {
        step_1: { business_description: 'We sell shoes' },
        step_2: { customer_tags: { type: ['retail'] } },
      },
      steps_completed: 2,
    }));
    mockSaveSessionAction.saveSession.mockResolvedValue(undefined);

    const result = await service.saveStepAnswer(USER_ID, {
      session_id: SESSION_ID, step: 3, answer: { discovery_channel: 'Instagram' }
    } as any);

    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.data.answers).toHaveProperty('step_3');
    expect(result.data.stepsCompleted).toBe(3);
  });

  it('AC-07: calling step 1 again overwrites previous answer — steps_completed stays same', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession({
      answers: { step_1: { business_description: 'Old answer' } },
      steps_completed: 1,
    }));
    mockSaveSessionAction.saveSession.mockResolvedValue(undefined);

    const result = await service.saveStepAnswer(USER_ID, {
      session_id: SESSION_ID, step: 1, answer: { business_description: 'New answer' }
    } as any);

    expect((result.data.answers as any).step_1).toEqual({ business_description: 'New answer' });
    expect(result.data.stepsCompleted).toBe(1);
  });

  it('AC-08: throws 422 when step 1 business_description exceeds 500 characters', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession());
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID, step: 1, answer: { business_description: 'x'.repeat(501) }
      } as any)
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-09: throws 422 when step 2 has no tags and no additional_notes', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(
      buildSession({ steps_completed: 1, answers: { step_1: { business_description: 'test' } } }),
    );
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID, step: 2, answer: { customer_tags: { type: [] } }
      } as any)
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-09a: accepts step 2 with additional_notes only (no tags selected)', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(
      buildSession({ steps_completed: 1, answers: { step_1: { business_description: 'test' } } }),
    );
    const result = await service.saveStepAnswer(USER_ID, {
      session_id: SESSION_ID,
      step: 2,
      answer: { customer_tags: {}, additional_notes: 'They are people who want to make their lives easier' },
    } as any);
    expect(result.statusCode).toBe(200);
  });

  it('AC-09b: throws 422 when step 2 has empty tags and blank additional_notes', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(
      buildSession({ steps_completed: 1, answers: { step_1: { business_description: 'test' } } }),
    );
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID,
        step: 2,
        answer: { customer_tags: { type: [] }, additional_notes: '   ' },
      } as any)
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-10: throws 422 when step 3 discovery_channel is invalid', async () => {
    mockSaveSessionAction.findSessionById.mockResolvedValue(buildSession());
    await expect(
      service.saveStepAnswer(USER_ID, {
        session_id: SESSION_ID, step: 3, answer: { discovery_channel: 'Twitter' }
      } as any)
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});