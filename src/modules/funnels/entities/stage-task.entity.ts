import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { FunnelStage } from './funnel-stage.entity';

export const STAGE_TASK_STATUS = ['pending', 'complete'] as const;
export type StageTaskStatus = (typeof STAGE_TASK_STATUS)[number];

@Entity('stage_tasks')
export class StageTask extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  stage_id: string;

  @ManyToOne(() => FunnelStage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stage_id' })
  stage: FunnelStage;

  @Index()
  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: STAGE_TASK_STATUS, default: 'pending' })
  status: StageTaskStatus;
}
