import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationPreferenceUpdatePayload } from '../interfaces/notification-preference.interface';

@Injectable()
export class NotificationPreferenceModelAction extends AbstractModelAction<NotificationPreference> {
  constructor(
    @InjectRepository(NotificationPreference)
    repository: Repository<NotificationPreference>,
  ) {
    super(repository, NotificationPreference);
  }

  async findByUserId(userId: string): Promise<NotificationPreference | null> {
    return this.get({ identifierOptions: { user_id: userId } });
  }

  /**
   * One page of preferences (with their user loaded) for users opted in to the
   * weekly digest. Paginated so the digest job never loads the whole table at once.
   * Ordered by id for a stable cursor across pages.
   */
  async findWeeklyDigestRecipients(limit: number, offset: number): Promise<NotificationPreference[]> {
    return this.repository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.user', 'u')
      .where('p.email_weekly_digest = true')
      .orderBy('p.id', 'ASC')
      .take(limit)
      .skip(offset)
      .getMany();
  }

  async createDefaultForUser(userId: string): Promise<NotificationPreference> {
    return this.create({
      createPayload: { user_id: userId },
      transactionOptions: { useTransaction: false },
    });
  }

  async updateByUserId(
    userId: string,
    payload: NotificationPreferenceUpdatePayload,
  ): Promise<NotificationPreference | null> {
    return this.update({
      identifierOptions: { user_id: userId },
      updatePayload: payload,
      transactionOptions: { useTransaction: false },
    });
  }
}
