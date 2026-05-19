import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { StageStatus } from '../enums/stage-status.enum';
import { Funnel } from './funnel.entity';
import { StageTask } from './stage-task.entity';

@Entity('funnel_stages')
export class FunnelStage extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'funnel_id' })
  funnel_id: string;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  channel: string;

  @Column({ type: 'text', default: '' })
  explanation: string;

  @Column({ type: 'text', name: 'action_prompt', default: '' })
  action_prompt: string;

  @Column({
    type: 'enum',
    enum: StageStatus,
    default: StageStatus.LOCKED,
  })
  status: StageStatus;

  @Column({ type: 'timestamptz', name: 'unlocked_at', nullable: true })
  unlocked_at: Date | null;

  // Relations
  @ManyToOne(() => Funnel, (funnel) => funnel.stages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'funnel_id' })
  funnel: Funnel;

  @OneToMany(() => StageTask, (task) => task.stage, { cascade: true })
  tasks: StageTask[];
}
