import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../email/email.service';
import { ContactModelAction } from './actions/contact.action';
import { CreateContactDto } from './dto/create-contact.dto';
import { IContactResponse } from './interfaces/contact.interface';
import { SpamDetectionService } from './spam-detection.service';
import { ContactAdminNotificationPayload } from '../../email/interfaces/email-job.interface';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly contactModelAction: ContactModelAction,
    private readonly spamDetectionService: SpamDetectionService,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateContactDto): Promise<IContactResponse> {
    this.spamDetectionService.validateSubmission(dto);

    const contact = await this.contactModelAction.createContact({
      full_name: dto.fullName,
      email: dto.email,
      business_name: dto.businessName ?? null,
      message: dto.message,
    });

    this.logger.log({
      message: 'Contact submission created',
      contactId: contact.id,
    });

    await this.emailService.sendContactConfirmation(contact.email, {
      fullName: contact.full_name,
    });

    const adminEmail = process.env.CONTACT_ADMIN_EMAIL ?? 'support@seil.app';

    await this.emailService.sendContactAdminNotification(adminEmail, {
      fullName: contact.full_name,
      email: contact.email,
      businessName: contact.business_name,
      message: contact.message,
    });

    return this.toResponse(contact);
  }

  private toResponse(contact: {
    id: string;
    full_name: string;
    email: string;
    business_name: string | null;
    message: string;
    status: import('./enums/contact-status.enum').ContactStatus;
    created_at: Date;
  }): IContactResponse {
    return {
      id: contact.id,
      fullName: contact.full_name,
      email: contact.email,
      businessName: contact.business_name,
      message: contact.message,
      status: contact.status,
      createdAt: contact.created_at,
    };
  }
}
