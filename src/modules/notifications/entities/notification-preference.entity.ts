import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('notification_preferences')
export class NotificationPreference extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'boolean', default: true })
  email_funnel_ready: boolean;

  @Column({ type: 'boolean', default: true })
  email_stage_unlocked: boolean;

  @Column({ type: 'boolean', default: false })
  email_stage_completed: boolean;

  @Column({ type: 'boolean', default: true })
  email_weekly_digest: boolean;

  @Column({ type: 'boolean', default: true })
  inapp_task_completed: boolean;

  @Column({ type: 'boolean', default: true })
  inapp_stage_unlocked: boolean;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
