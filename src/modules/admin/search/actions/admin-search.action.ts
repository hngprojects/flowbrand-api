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
    // Escape standard SQL LIKE wildcards (% and _) to treat them as literal values
    const normalizedQuery = query.replace(/[%_]/g, '\\$&');
    const pattern = `%${normalizedQuery}%`;
    return this.repository.find({
      where: [
        { full_name: ILike(pattern) },
        { email: ILike(pattern) },
      ],
      withDeleted: true,
    });
  }
}