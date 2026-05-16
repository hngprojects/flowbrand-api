import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WizardSession } from '../entities/wizzard-session.entity';
import { WizardStatus } from '../enums/wizzard-status.enum';

@Injectable()
export class WizardSessionModelAction extends AbstractModelAction<WizardSession> {
  constructor(
    @InjectRepository(WizardSession)
    private readonly wizardSessionRepository: Repository<WizardSession>,
  ) {
    super(wizardSessionRepository, WizardSession);
  }

  async findCompletedByUserId(userId: string): Promise<WizardSession | null> {
    return this.wizardSessionRepository.findOne({
      where: { user_id: userId, status: WizardStatus.COMPLETE },
    });
  }

  /**
   * Most recent non-expired in-progress session for the user, if any.
   */
  async findActiveInProgressByUserId(
    userId: string,
    at: Date,
  ): Promise<WizardSession | null> {
    return this.wizardSessionRepository
      .createQueryBuilder('ws')
      .where('ws.user_id = :userId', { userId })
      .andWhere('ws.status = :status', { status: WizardStatus.IN_PROGRESS })
      .andWhere('ws.expires_at > :at', { at })
      .orderBy('ws.created_at', 'DESC')
      .getOne();
  }

  async createWizardSession(
    createPayload: Partial<WizardSession>,
  ): Promise<WizardSession> {
    return await this.create({
      createPayload,
      transactionOptions: { useTransaction: false },
    });
  }
}
