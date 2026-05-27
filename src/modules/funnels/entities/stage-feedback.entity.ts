import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

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
}