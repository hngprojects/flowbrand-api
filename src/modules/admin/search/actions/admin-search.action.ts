import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';

@Injectable()
export class AdminSearchModelAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository, User);
  }

  /**
   * Search users by name or email with wildcard escaping, prioritizing exact matches at the DB level,
   * and including soft-deleted accounts. Direct repository access is necessary here because 
   * the abstract find/list CRUD methods do not support CASE-WHEN ranking selections and withDeleted options.
   */
  async searchUsers(query: string): Promise<User[]> {
    const normalizedQuery = query.replace(/[%_]/g, '\\$&');
    const pattern = `%${normalizedQuery}%`;

    return this.repository
      .createQueryBuilder('user')
      .addSelect(
        `CASE WHEN lower(user.email) = lower(:q) THEN 1
              WHEN lower(user.full_name) = lower(:q) THEN 2
              ELSE 3 END`,
        'rank',
      )
      .where('user.full_name ILIKE :pattern OR user.email ILIKE :pattern', { pattern, q: query })
      .orderBy('rank', 'ASC')
      .addOrderBy('user.created_at', 'DESC')
      .withDeleted()
      .take(10)
      .setParameter('q', query)
      .getMany();
  }
}