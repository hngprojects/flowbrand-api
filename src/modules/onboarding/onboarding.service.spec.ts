import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingModelAction } from './actions/onboarding.action';
import { WizardSessionStatus } from './enums/wizard-session.enum';

const mockSession = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  user_id: 'user-uuid',
  status: WizardSessionStatus.IN_PROGRESS,
  steps_completed: 2,
  answers: { step_1: { name: 'Jane' }, step_2: null },
  expires_at: new Date(Date.now() + 1000 * 60 * 60),
  created_at: new Date(),
  updated_at: new Date(),
};

const mockAction = {
  findActiveSession: jest.fn(),
  markAsExpired: jest.fn(),
};

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: OnboardingModelAction, useValue: mockAction },
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