import { WizardStatus } from '../../modules/onboarding/enums/wizzard-status.enum';
import { FunnelStatus } from '../../modules/funnels/enums/funnel-status.enum';
import { StageStatus } from '../../modules/funnels/enums/stage-status.enum';

// ── Users ─────────────────────────────────────────────────────────────────────

export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'test@example.com',
    full_name: 'Test User',
    password_hash: 'hashed-password',
    is_verified: true,
    is_active: true,
    auth_provider: 'local',
    terms_accepted: true,
    business_type: null,
    target_customer: null,
    primary_goal: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ── Wizard Sessions ───────────────────────────────────────────────────────────

export function mockWizardSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: WizardStatus.IN_PROGRESS,
    steps_completed: 0,
    answers: {},
    expires_at: new Date('2099-01-01T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function mockCompletedWizardSession(overrides: Record<string, unknown> = {}) {
  return mockWizardSession({
    status: WizardStatus.COMPLETE,
    steps_completed: 3,
    answers: {
      step_1: { business_description: 'We sell handmade shoes' },
      step_2: { customer_tags: { type: ['retail'] } },
      step_3: { discovery_channel: 'Instagram' },
    },
    ...overrides,
  });
}

// ── Funnels ───────────────────────────────────────────────────────────────────

export function mockFunnel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: FunnelStatus.GENERATING,
    idempotency_key: 'test-idempotency-key',
    business_context: {},
    stages: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function mockActiveFunnel(overrides: Record<string, unknown> = {}) {
  return mockFunnel({
    status: FunnelStatus.ACTIVE,
    stages: [
      mockFunnelStage({ position: 1, status: StageStatus.ACTIVE }),
      mockFunnelStage({ position: 2, status: StageStatus.LOCKED }),
      mockFunnelStage({ position: 3, status: StageStatus.LOCKED }),
      mockFunnelStage({ position: 4, status: StageStatus.LOCKED }),
    ],
    ...overrides,
  });
}

// ── Funnel Stages ─────────────────────────────────────────────────────────────

export function mockFunnelStage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    funnel_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    position: 1,
    name: 'Get Noticed',
    channel: 'Instagram',
    explanation: 'Build visibility for your business',
    action_prompt: 'Post 3 pieces of content this week',
    status: StageStatus.LOCKED,
    unlocked_at: null,
    tasks: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

export function mockWaitlistEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    email: 'waitlist@example.com',
    is_notified: false,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}