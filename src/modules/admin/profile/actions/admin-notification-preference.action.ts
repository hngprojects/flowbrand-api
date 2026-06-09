import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AdminNotificationPreference } from '../entities/admin-notification-preference.entity';
import { AdminNotificationPreferenceUpdatePayload } from '../interfaces/admin-notification-preference.interface';

@Injectable()
export class AdminNotificationPreferenceModelAction extends AbstractModelAction<AdminNotificationPreference> {
  constructor(
    @InjectRepository(AdminNotificationPreference)
    repository: Repository<AdminNotificationPreference>,
  ) {
    super(repository, AdminNotificationPreference);
  }

  async findByUserId(userId: string): Promise<AdminNotificationPreference | null> {
    return this.get({ identifierOptions: { user_id: userId } });
  }

  async createDefaultForUser(userId: string, transaction?: EntityManager): Promise<AdminNotificationPreference> {
    return this.create({
      createPayload: { user_id: userId },
      transactionOptions: transaction
        ? { useTransaction: true, transaction }
        : { useTransaction: false },
    });
  }

  async updateByUserId(
    userId: string,
    payload: AdminNotificationPreferenceUpdatePayload,
  ): Promise<AdminNotificationPreference | null> {
    return this.update({
      identifierOptions: { user_id: userId },
      updatePayload: payload,
      transactionOptions: { useTransaction: false },
    });
  }
}