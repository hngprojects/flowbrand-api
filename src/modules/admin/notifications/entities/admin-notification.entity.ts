import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';
import { User } from '../../../users/entities/user.entity';
import { AdminNotificationType } from '../enums/admin-notification.enum';

// Composite indexes back the feed filters: read tab, type tabs and starred tab (FR-1).
// The migration also adds a partial unique index UQ_admin_notifications_risk_admin_stage
// on (admin_id, metadata ->> 'stage_id') WHERE type = 'risk' (not expressible as a
// decorator) so duplicate risk alerts are impossible even under concurrent scans.
@Entity('admin_notifications')
@Index('IDX_admin_notifications_admin_id_is_read', ['admin_id', 'is_read'])
@Index('IDX_admin_notifications_admin_id_type', ['admin_id', 'type'])
@Index('IDX_admin_notifications_admin_id_is_starred', ['admin_id', 'is_starred'])
export class AdminNotification extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  admin_id: string;

  @Column({ type: 'enum', enum: AdminNotificationType })
  type: AdminNotificationType;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sender_name: string | null;

  @Column({ type: 'text', nullable: true })
  sender_avatar_url: string | null;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  // FR-1 omits read_at but FR-3 sets it on mark-as-read; kept nullable to satisfy FR-3,
  // mirroring the user-facing notifications table.
  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;

  @Column({ type: 'boolean', default: false })
  is_starred: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin: User;
}
