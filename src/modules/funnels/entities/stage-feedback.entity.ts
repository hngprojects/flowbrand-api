import { Column, Entity, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Funnel } from './funnel.entity';
import { FunnelStage } from './funnel-stage.entity';

@Entity('stage_feedback')
@Unique(['user_id', 'stage_id'])
export class StageFeedback extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Index()
  @Column({ type: 'uuid' })
  funnel_id: string;

  @Index()
  @Column({ type: 'uuid' })
  stage_id: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Funnel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'funnel_id' })
  funnel: Funnel;
  
  @ManyToOne(() => FunnelStage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stage_id' })
  stage: FunnelStage
}