import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserModelAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository, User);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.get({ identifierOptions: { email } });
  }

  async findByEmailWithDeleted(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email }, withDeleted: true });
  }

  async findById(id: string): Promise<User | null> {
    return this.get({ identifierOptions: { id } });
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<User | null> {
    return this.update({
      transactionOptions: { useTransaction: false },
      identifierOptions: { id: userId },
      updatePayload: { avatar_url: avatarUrl },
    });
  }
}
