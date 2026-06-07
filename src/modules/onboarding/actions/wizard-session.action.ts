import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { WizardSession } from '../entities/wizzard-session.entity';
import { WizardStatus } from '../enums/wizzard-status.enum';
import { WizardStartResolveResult } from '../interfaces/onboarding.interface';

@Injectable()
export class WizardSessionModelAction extends AbstractModelAction<WizardSession> {
  constructor(
    @InjectRepository(WizardSession)
    private readonly wizardSessionRepository: Repository<WizardSession>,
  ) {
    super(wizardSessionRepository, WizardSession);
  }

  async resolveStartWizardSession(
    userId: string,
    at: Date,
    expiresAt: Date,
  ): Promise<WizardStartResolveResult> {
    return this.wizardSessionRepository.manager.transaction(
      async (manager) => {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          userId,
        ]);

        const repo = manager.getRepository(WizardSession);

        const active = await this.findActiveInProgress(repo, userId, at);
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

  private findActiveInProgress(
    repo: Repository<WizardSession>,
    userId: string,
    at: Date,
  ): Promise<WizardSession | null> {
    return this.applyActiveInProgressFilters(
      repo.createQueryBuilder('ws'),
      userId,
      at,
    ).getOne();
  }

  private applyActiveInProgressFilters(
    qb: SelectQueryBuilder<WizardSession>,
    userId: string,
    at: Date,
  ): SelectQueryBuilder<WizardSession> {
    return qb
      .where('ws.user_id = :userId', { userId })
      .andWhere('ws.status = :status', { status: WizardStatus.IN_PROGRESS })
      .andWhere('ws.expires_at > :at', { at })
      .orderBy('ws.created_at', 'DESC');
  }
  
  async findActiveSession(userId: string): Promise<WizardSession | null> {
    return this.repository
      .createQueryBuilder('ws')
      .where('ws.user_id = :userId', { userId })
      .andWhere('ws.status IN (:...statuses)', {
        statuses: ['in_progress', 'complete']
      })
      .orderBy('ws.created_at', 'DESC')
      .limit(1)
      .getOne();
  }

  async markAsExpired(id: string): Promise<void> {
    await this.repository.update(id, { status: WizardStatus.EXPIRED })
  }

  async findSessionById(sessionId: string, userId: string): Promise<WizardSession | null> {
    return this.repository
      .createQueryBuilder('ws')
      .where('ws.id = :sessionId', { sessionId })
      .andWhere('ws.user_id = :userId', { userId })
      .getOne()
  }

  async saveSession(session: WizardSession): Promise<WizardSession> {
    return this.repository.save(session)
  }
}
