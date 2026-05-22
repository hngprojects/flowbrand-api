import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { FunnelCreationPath } from '../enums/funnel-creation-path.enum';
import { FunnelStatus } from '../enums/funnel-status.enum';
import { FunnelStage } from './funnel-stage.entity';

// Composite index supports the BE-305 concurrent-generation check:
// SELECT 1 FROM funnels WHERE user_id = $1 AND status = 'generating'.
@Entity('funnels')
@Index('IDX_funnels_user_id_status', ['user_id', 'status'])
@Index('UQ_funnels_user_idempotency', ['user_id', 'idempotency_key'], { unique: true })
export class Funnel extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 255, name: 'business_name', default: 'My Business' })
  business_name: string;

  @Column({
    type: 'enum',
    enum: FunnelCreationPath,
    name: 'creation_path',
    default: FunnelCreationPath.WIZARD,
  })
  creation_path: FunnelCreationPath;

  @Column({
    type: 'enum',
    enum: FunnelStatus,
    default: FunnelStatus.GENERATING,
  })
  status: FunnelStatus;

  @Column({ type: 'varchar', length: 255, name: 'idempotency_key' })
  idempotency_key: string;

  @Column({ type: 'jsonb', name: 'business_context', default: '{}' })
  business_context: Record<string, unknown>;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => FunnelStage, (stage) => stage.funnel, { cascade: true })
  stages: FunnelStage[];
}
