import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AppEvent } from '../../../common/constants/app-events';
import { User } from '../../users/entities/user.entity';

/**
 * Append-only audit log. One row is written per domain event by ActivityListener.
 * Intentionally does NOT extend BaseEntity: there is no updated_at, because
 * activity rows are never mutated after insert.
 */
@Entity('activity_events')
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  event_type: AppEvent;

  @Column({ type: 'uuid', nullable: true })
  funnel_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  stage_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  task_id: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
