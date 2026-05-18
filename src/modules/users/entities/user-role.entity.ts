import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { User } from './user.entity';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('user_roles')
@Index(['user_id', 'role'], { unique: true })
export class UserRoleEntity extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  // Relations
  @ManyToOne(() => User, (u) => u.roles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
