import { Test, TestingModule } from '@nestjs/testing';
import { ContactService } from './contact.service';
import { ContactModelAction } from './actions/contact.action';
import { SpamDetectionService } from './spam-detection.service';
import { EmailService } from '../../email/email.service';
import { ContactStatus } from './enums/contact-status.enum';

describe('ContactService', () => {
  let service: ContactService;
  let modelAction: ContactModelAction;
  let emailService: EmailService;
  let spamService: SpamDetectionService;

  const mockContact = {
    id: 'uuid-123',
    full_name: 'John Doe',
    email: 'john.doe@gmail.com',
    business_name: 'Business Inc.',
    message: 'Had a great week!',
    status: ContactStatus.PENDING,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        {
          provide: ContactModelAction,
          useValue: { createContact: jest.fn().mockResolvedValue(mockContact) },
        },
        {
          provide: SpamDetectionService,
          useValue: { validateSubmission: jest.fn() },
        },
        {
          provide: EmailService,
          useValue: {
            sendContactConfirmation: jest.fn().mockResolvedValue(true),
            sendContactAdminNotification: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<ContactService>(ContactService);
    modelAction = module.get<ContactModelAction>(ContactModelAction);
    emailService = module.get<EmailService>(EmailService);
    spamService = module.get<SpamDetectionService>(SpamDetectionService);
  });

  it('should successfully process a contact submission', async () => {
    const dto = {
      fullName: 'John Doe',
      email: 'john.doe@gmail.com',
      businessName: 'Business Inc.',
      message: 'Had a great week!',
    };

    const result = await service.create(dto);

    // Assertions
    expect(spamService.validateSubmission).toHaveBeenCalledWith(dto);
    expect(modelAction.createContact).toHaveBeenCalled();
    expect(emailService.sendContactConfirmation).toHaveBeenCalledWith(mockContact.email, {
      fullName: mockContact.full_name,
    });
    expect(emailService.sendContactAdminNotification).toHaveBeenCalled();

    expect(result.fullName).toBe(mockContact.full_name);
    expect(result.status).toBe('pending');
  });

  it('should successfully process a contact submission', async () => {
    const dto = {
      fullName: 'John Doe',
      email: 'john.doe@gmail.com',
      businessName: 'Business Inc.',
      message: 'Had a great week!',
    };

    const result = await service.create(dto);

    expect(spamService.validateSubmission).toHaveBeenCalledWith(dto);
    expect(modelAction.createContact).toHaveBeenCalled();

    expect(emailService.sendContactConfirmation).toHaveBeenCalledWith(mockContact.email, {
      fullName: mockContact.full_name,
    });

    expect(result).toEqual({
      id: mockContact.id,
      fullName: mockContact.full_name,
      email: mockContact.email,
      businessName: mockContact.business_name,
      message: mockContact.message,
      status: mockContact.status,
      createdAt: mockContact.created_at,
    });
  });
});
