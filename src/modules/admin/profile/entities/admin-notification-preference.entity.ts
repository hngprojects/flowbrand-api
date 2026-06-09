import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';
import { User } from '../../../users/entities/user.entity';

@Entity('admin_notification_preferences')
export class AdminNotificationPreference extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'boolean', default: true })
  general_notifications: boolean;

  @Column({ type: 'boolean', default: true })
  push_email: boolean;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}