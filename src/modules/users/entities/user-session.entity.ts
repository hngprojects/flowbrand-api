import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../../users/entities/user.entity';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('user_sessions')
export class UserSession extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Exclude()
  @Column({ type: 'text' })
  refresh_token: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'boolean', default: false })
  is_revoked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  // Relations
  @ManyToOne(() => User, (u) => u.sessions, { onDelete: 'CASCADE' })
  user: User;
}
