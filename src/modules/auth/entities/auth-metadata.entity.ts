import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('auth_metadata')
export class AuthMetadata extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'timestamptz', nullable: true })
  locked_until: Date | null;

  @Column({ type: 'int', default: 0 })
  failed_attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  password_changed_at: Date | null;

  // Relations
  @OneToOne(() => User, (u) => u.auth_metadata, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
