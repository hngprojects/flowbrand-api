import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WizardSession } from '../entities/wizzard-session.entity';
import { WizardStatus } from '../enums/wizzard-status.enum';

export type ResolveWizardStartResult =
  | { status: 'already_complete' }
  | { status: 'active'; session: WizardSession }
  | { status: 'created'; session: WizardSession };

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

 
  async resolveStartWizardSession(
    userId: string,
    at: Date,
    expiresAt: Date,
  ): Promise<ResolveWizardStartResult> {
    return this.wizardSessionRepository.manager.transaction(
      async (manager) => {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          userId,
        ]);

        const repo = manager.getRepository(WizardSession);

        const completed = await repo.findOne({
          where: { user_id: userId, status: WizardStatus.COMPLETE },
        });
        if (completed) {
          return { status: 'already_complete' };
        }

        const active = await this.findActiveInProgressWithManager(
          repo,
          userId,
          at,
        );
        if (active) {
          return { status: 'active', session: active };
        }

        const created = await repo.save(
          repo.create({
            user_id: userId,
            status: WizardStatus.IN_PROGRESS,
            steps_completed: 0,
            answers: {},
            expires_at: expiresAt,
          }),
        );

        return { status: 'created', session: created };
      },
    );
  }

  private findActiveInProgressWithManager(
    repo: Repository<WizardSession>,
    userId: string,
    at: Date,
  ): Promise<WizardSession | null> {
    return repo
      .createQueryBuilder('ws')
      .where('ws.user_id = :userId', { userId })
      .andWhere('ws.status = :status', { status: WizardStatus.IN_PROGRESS })
      .andWhere('ws.expires_at > :at', { at })
      .orderBy('ws.created_at', 'DESC')
      .getOne();
  }
}
