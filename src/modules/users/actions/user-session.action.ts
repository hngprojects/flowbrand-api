import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { UserSession } from './../entities/user-session.entity';

@Injectable()
export class UserSessionModelAction extends AbstractModelAction<UserSession> {
  constructor(
    @InjectRepository(UserSession)
    repository: Repository<UserSession>,
  ) {
    super(repository, UserSession);
  }

  async findById(id: string): Promise<UserSession | null> {
    return (await this.get({ identifierOptions: { id } }));
  }

  async findByUserId(userId: string): Promise<UserSession[]> {
    const result = await this.repository.find({
      where: { user_id: userId, is_revoked: false },
    });
    return result || [];
  }

  async updateById(
    id: string,
    updatePayload: Partial<UserSession>,
  ): Promise<UserSession | null> {
    return (await this.update({
      identifierOptions: { id },
      updatePayload,
      transactionOptions: { useTransaction: false },
    }));
  }

  async deleteById(id: string): Promise<void> {
    await this.delete({ identifierOptions: { id }, transactionOptions: { useTransaction: false } });
  }

  async createSession(createPayload: Partial<UserSession>): Promise<UserSession> {
    return (await this.create({ createPayload, transactionOptions: { useTransaction: false } }));
  }

  async revokeAllUserSessionsInDb(userId: string, manager?: EntityManager): Promise<string[]> {
    const repo = manager ? manager.getRepository(UserSession) : this.repository;

    const activeSessions = await repo.find({
      where: { user_id: userId, is_revoked: false },
      select: ['id'],
    });

    const sessionIds = activeSessions.map(s => s.id);

    if (sessionIds.length === 0) {
      return [];
    }
    
    await repo.update(
      { user_id: userId, is_revoked: false },
      { is_revoked: true, revoked_at: new Date() },
    );

    return sessionIds;
  }
}
