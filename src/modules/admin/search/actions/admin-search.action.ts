import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';

@Injectable()
export class AdminSearchModelAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository, User);
  }

  async searchUsers(query: string): Promise<User[]> {
    const pattern = `%${query}%`;
    return this.repository.find({
      where: [
        { full_name: ILike(pattern) },
        { email: ILike(pattern) },
      ],
      withDeleted: true,
    });
  }
}