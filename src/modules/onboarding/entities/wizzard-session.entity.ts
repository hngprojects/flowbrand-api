import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BaseEntity } from '../../../common/entities/base.entity';
import { WizardStatus } from '../enums/wizzard-status.enum';

@Entity('wizard_sessions')
export class WizardSession extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({
    type: 'enum',
    enum: WizardStatus,
    default: WizardStatus.IN_PROGRESS,
  })
  status: WizardStatus;

  @Column({ type: 'int', default: 0 })
  steps_completed: number;

  @Column({ type: 'jsonb', default: '{}' })
  answers: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
