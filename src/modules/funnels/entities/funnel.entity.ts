import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { FunnelStatus } from '../enums/funnel-status.enum';
import { FunnelStage } from './funnel-stage.entity';

@Entity('funnels')
export class Funnel extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({
    type: 'enum',
    enum: FunnelStatus,
    default: FunnelStatus.GENERATING,
  })
  status: FunnelStatus;

  @Index({ unique: true })
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
