import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { AdminLogActionType, AdminLogStatus } from '../enums/admin-log.enum';

/**
 * Append-only audit trail consumed by the admin logs feed (BE-ADM-608).
 * Rows are created exclusively by LogService (BE-ADM-609); this API is
 * read-only. Intentionally does NOT extend BaseEntity: there is no
 * updated_at, because log entries are immutable after insert.
 */
@Entity('admin_logs')
export class AdminLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable: unauthenticated actions and entries for deleted users (FK is SET NULL). */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  action_type: AdminLogActionType;

  @Column({ type: 'text' })
  description: string;

  /** varchar(45) fits a full IPv6 textual address. */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Index()
  @Column({ type: 'varchar', length: 10 })
  status: AdminLogStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
