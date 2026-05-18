import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { FunnelStage } from './funnel-stage.entity';

export const FUNNEL_STATUS = ['generating', 'active', 'complete'] as const;
export type FunnelStatus = (typeof FUNNEL_STATUS)[number];

@Entity('funnels')
export class Funnel extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 255 })
  business_name: string;

  @Column({ type: 'varchar', length: 100 })
  creation_path: string;

  @Column({ type: 'enum', enum: FUNNEL_STATUS, default: 'generating' })
  status: FunnelStatus;

  @OneToMany(() => FunnelStage, (s) => s.funnel)
  stages: FunnelStage[];
}
