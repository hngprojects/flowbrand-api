import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';

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
      transactionOptions: { useTransaction: true },
      identifierOptions: { id: userId },
      updatePayload,
    });
  }
}
