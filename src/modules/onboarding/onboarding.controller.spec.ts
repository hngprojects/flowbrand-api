import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { WizardSessionStatus } from './enums/wizard-session.enum';

const mockService = {
  getOnboardingSession: jest.fn(),
};

describe('OnboardingController', () => {
  let controller: OnboardingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        { provide: OnboardingService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('AC-01: should call service with userId and return session', async () => {
    const mockResult = {
      sessionId: 'a1b2c3d4',
      status: WizardSessionStatus.IN_PROGRESS,
      steps_completed: 2,
      answers: { step_1: { name: 'Jane' } },
      created_at: new Date(),
      expires_at: null,
    };
    mockService.getOnboardingSession.mockResolvedValue(mockResult);
    const result = await controller.getOnboardingSession('user-uuid');
    expect(mockService.getOnboardingSession).toHaveBeenCalledWith('user-uuid');
    expect(result).toEqual(mockResult);
  });
});