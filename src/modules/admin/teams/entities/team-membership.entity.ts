import { Column, Entity, ManyToOne, JoinColumn, Unique, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { AdminTeam } from './admin-team.entity';

@Entity('team_memberships')
@Unique(['team_id', 'user_id'])
export class TeamMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
  
  @Column({ type: 'uuid' })
  team_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role: string;

  @Column({ type: 'timestamptz' })
  joined_at: Date;

  @ManyToOne(() => AdminTeam, (team) => team.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: AdminTeam;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}