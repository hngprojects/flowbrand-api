import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { WaitlistModelAction } from './actions/waitlist.action';
import { WaitlistService } from './waitlist.service';

const mockWaitlistAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
};

const mockEmailService = {
  sendWaitlistConfirmation: jest.fn(),
};

const DTO = {
  email: 'testuser@example.com',
};

const EXISTING_USER = {
  id: 'uuid-1',
  email: 'testuser@example.com',
  is_notified: false,
};

const NEW_USER = {
  id: 'uuid-2',
  email: 'testuser@example.com',
  is_notified: false,
};

describe('WaitlistService', () => {
  let service: WaitlistService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: WaitlistModelAction, useValue: mockWaitlistAction },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('joinWaitlist', () => {
    it('should return existing user and isNew=false if email already on waitlist', async () => {
      mockWaitlistAction.findByEmail.mockResolvedValue(EXISTING_USER);

      const result = await service.joinWaitlist(DTO);

      expect(mockWaitlistAction.findByEmail).toHaveBeenCalledWith(DTO.email);
      expect(mockWaitlistAction.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendWaitlistConfirmation).not.toHaveBeenCalled();

      expect(result).toEqual({ user: EXISTING_USER, isNew: false });
    });

    it('should create new user, send confirmation email, and return isNew=true', async () => {
      mockWaitlistAction.findByEmail.mockResolvedValue(null);
      mockWaitlistAction.create.mockResolvedValue(NEW_USER);
      mockEmailService.sendWaitlistConfirmation.mockResolvedValue('job-id-123');

      const result = await service.joinWaitlist(DTO);

      expect(mockWaitlistAction.findByEmail).toHaveBeenCalledWith(DTO.email);
      expect(mockWaitlistAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: {
            email: DTO.email,
            is_notified: false,
          },
        }),
      );
      expect(mockEmailService.sendWaitlistConfirmation).toHaveBeenCalledWith(
        NEW_USER.email,
        { user: { name: 'testuser' } },
      );

      expect(result).toEqual({ user: NEW_USER, isNew: true });
    });

    it('should extract name properly from email for the email payload', async () => {
      const weirdEmailDto = { email: 'john.doe.123@domain.co.uk' };
      const weirdUser = { id: 'uuid-3', email: weirdEmailDto.email, is_notified: false };
      
      mockWaitlistAction.findByEmail.mockResolvedValue(null);
      mockWaitlistAction.create.mockResolvedValue(weirdUser);

      await service.joinWaitlist(weirdEmailDto);

      expect(mockEmailService.sendWaitlistConfirmation).toHaveBeenCalledWith(
        weirdUser.email,
        { user: { name: 'john.doe.123' } },
      );
    });

    it('should swallow email service errors but still return the created user', async () => {
      mockWaitlistAction.findByEmail.mockResolvedValue(null);
      mockWaitlistAction.create.mockResolvedValue(NEW_USER);
      
      const error = new Error('Redis connection failed');
      mockEmailService.sendWaitlistConfirmation.mockRejectedValue(error);
      
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      const result = await service.joinWaitlist(DTO);

      expect(mockEmailService.sendWaitlistConfirmation).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to queue waitlist email for te***@example.com`,
        error.stack,
      );
      
      // Still returns success for the user
      expect(result).toEqual({ user: NEW_USER, isNew: true });
    });
  });
});
