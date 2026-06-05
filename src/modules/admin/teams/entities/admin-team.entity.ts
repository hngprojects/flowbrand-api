import { Column, Entity, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';
import { User } from '../../../users/entities/user.entity';
import { TeamStatus } from '../enums/team-status.enum';
import { TeamMembership } from './team-membership.entity';
import { TeamInvitation } from './team-invitation.entity'

@Entity('admin_teams')
export class AdminTeam extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;
 
  @Column({ type: 'text', nullable: true })
  description: string | null;
 
  @Column({
    type: 'enum',
    enum: TeamStatus,
    default: TeamStatus.ACTIVE,
  })
  status: TeamStatus;
 
  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;
 
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;
 
  @OneToMany(() => TeamMembership, (membership) => membership.team, { cascade: true })
  memberships: TeamMembership[];
 
  @OneToMany(() => TeamInvitation, (invitation) => invitation.team, { cascade: true })
  invitations: TeamInvitation[];
}