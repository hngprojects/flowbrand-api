import { Column, Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';
import { User } from '../../../users/entities/user.entity';
import { AdminTeam } from './admin-team.entity';
import { InviteStatus } from '../enums/invite-status.enum';

@Entity('team_invitations')
@Unique(['team_id', 'email'])
export class TeamInvitation extends BaseEntity {
  @Column({ type: 'uuid' })
  team_id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  role: string;

  @Column({ type: 'uuid' })
  invited_by: string;

  @Column({ type: 'text' })
  token_hash: string;

  @Column({
    type: 'enum',
    enum: InviteStatus,
    default: InviteStatus.PENDING,
  })
  status: InviteStatus;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @ManyToOne(() => AdminTeam, (team) => team.invitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: AdminTeam;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by' })
  inviter: User;
}