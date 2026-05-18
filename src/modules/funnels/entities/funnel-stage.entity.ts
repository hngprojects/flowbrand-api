import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Funnel } from './funnel.entity';
import { StageTask } from './stage-task.entity';

export const FUNNEL_STAGE_STATUS = ['locked', 'active', 'complete'] as const;
export type FunnelStageStatus = (typeof FUNNEL_STAGE_STATUS)[number];

@Entity('funnel_stages')
export class FunnelStage extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  funnel_id: string;

  @ManyToOne(() => Funnel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'funnel_id' })
  funnel: Funnel;

  @Index()
  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  channel: string | null;

  @Column({ type: 'enum', enum: FUNNEL_STAGE_STATUS, default: 'locked' })
  status: FunnelStageStatus;

  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  @Column({ type: 'text', nullable: true })
  action_prompt: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  unlocked_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @OneToMany(() => StageTask, (t) => t.stage)
  tasks: StageTask[];
}
