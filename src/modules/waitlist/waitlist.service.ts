import { Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { maskEmail } from '../../utils/pii.utils';
import { EmailService } from '../../email/email.service';
import { WaitlistModelAction } from './actions/waitlist.action';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { Waitlist } from './entities/waitlist.entity';

const NO_TRANSACTION = {
  transactionOptions: { useTransaction: false as const },
};

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly waitlistAction: WaitlistModelAction,
    private readonly emailService: EmailService,
  ) {}

  async joinWaitlist(
    dto: JoinWaitlistDto,
  ): Promise<{ user: Waitlist; isNew: boolean }> {
    const existing = await this.waitlistAction.findByEmail(dto.email);
    if (existing) {
      return { user: existing, isNew: false };
    }

    let user: Waitlist;
    try {
      user = await this.waitlistAction.create({
        ...NO_TRANSACTION,
        createPayload: {
          email: dto.email,
          is_notified: false,
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code ===
          '23505'
      ) {
        const existingAfterCreate = await this.waitlistAction.findByEmail(
          dto.email,
        );
        if (existingAfterCreate) {
          return { user: existingAfterCreate, isNew: false };
        }
      }
      throw error;
    }

    try {
      await this.emailService.sendWaitlistConfirmation(user.email, {
        user: { name: user.email.split('@')[0] },
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue waitlist email for ${maskEmail(user.email)}`,
        (err as Error).stack,
      );
    }

    return { user, isNew: true };
  }
}
