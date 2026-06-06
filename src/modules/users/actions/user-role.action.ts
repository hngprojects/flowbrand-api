import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleEntity } from '../entities/user-role.entity';
import { UserRole } from '../enums/user-role.enum';

const ROLE_PRIORITY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 2,
  [UserRole.ADMIN]: 1,
  [UserRole.USER]: 0,
};

@Injectable()
export class UserRoleModelAction extends AbstractModelAction<UserRoleEntity> {
  constructor(
    @InjectRepository(UserRoleEntity)
    repository: Repository<UserRoleEntity>,
  ) {
    super(repository, UserRoleEntity);
  }

  /** Returns all role rows for a user. */
  async findAllByUserId(userId: string): Promise<UserRoleEntity[]> {
    return this.repository.find({ where: { user_id: userId } });
  }

  /** Resolves the highest-priority role for a user, or null if they have no roles. */
  async resolveHighestRole(userId: string): Promise<UserRole | null> {
    const roles = await this.findAllByUserId(userId);
    if (!roles.length) return null;
    return roles.reduce((highest, row) => (ROLE_PRIORITY[row.role] > ROLE_PRIORITY[highest.role] ? row : highest)).role;
  }
}
