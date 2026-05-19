import { BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { FunnelStage } from './funnel-stage.entity';

export const STAGE_TASK_STATUS = ['pending', 'complete'] as const;
export type StageTaskStatus = (typeof STAGE_TASK_STATUS)[number];

@Entity('stage_tasks')
export class StageTask extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'stage_id' })
  stage_id: string;

  @Column({ type: 'text', name: 'task_text' })
  task_text: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'boolean', name: 'is_complete', default: false })
  is_complete: boolean;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completed_at: Date | null;

  @Index()
  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'enum', enum: STAGE_TASK_STATUS, default: 'pending' })
  status: StageTaskStatus;

  @BeforeInsert()
  @BeforeUpdate()
  syncCompletionState(): void {
    if (this.status === 'complete') {
      this.is_complete = true;
      this.completed_at = this.completed_at ?? new Date();
      return;
    }

    this.is_complete = false;
    this.completed_at = null;
  }

  // Relations
  @ManyToOne(() => FunnelStage, (stage) => stage.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stage_id' })
  stage: FunnelStage;
}