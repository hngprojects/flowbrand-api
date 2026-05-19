import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { FunnelStage } from './funnel-stage.entity';

@Entity('stage_tasks')
export class StageTask extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'stage_id' })
  stage_id: string;

  @Column({ type: 'text', name: 'task_text' })
  task_text: string;

  @Column({ type: 'boolean', name: 'is_complete', default: false })
  is_complete: boolean;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completed_at: Date | null;

  // Relations
  @ManyToOne(() => FunnelStage, (stage) => stage.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stage_id' })
  stage: FunnelStage;
}
