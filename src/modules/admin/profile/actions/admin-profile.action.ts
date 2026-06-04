import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { UserSession } from '../../../users/entities/user-session.entity';
@Injectable()
export class AdminProfileModelAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository, User);
  }

  async findById(id: string): Promise<User | null> {
    return this.get({ identifierOptions: { id } });
  }

  async updateProfile(userId: string, updatePayload: Partial<User>): Promise<User | null> {
    return this.update({
      transactionOptions: { useTransaction: false },
      identifierOptions: { id: userId },
      updatePayload,
    });
  }

  async updatePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      const passwordUpdate = await manager.getRepository(User).update(
        { id: userId },
        { password_hash: passwordHash },
      );

      if (!passwordUpdate.affected) {
        throw new Error('Failed to update admin password hash');
      }

      await manager.getRepository(UserSession).update(
        { user_id: userId, is_revoked: false },
        { is_revoked: true, revoked_at: new Date() },
      );
    });
  }
}
