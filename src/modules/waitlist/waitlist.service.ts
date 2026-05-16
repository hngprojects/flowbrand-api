import { Injectable, Logger } from '@nestjs/common';
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

    const user = await this.waitlistAction.create({
      ...NO_TRANSACTION,
      createPayload: {
        email: dto.email,
        is_notified: false,
      },
    });

    try {
      await this.emailService.sendWaitlistConfirmation(user.email, {
        user: { name: user.email.split('@')[0] },
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue waitlist email for ${user.email}`,
        (err as Error).stack,
      );
    }

    return { user, isNew: true };
  }
}
