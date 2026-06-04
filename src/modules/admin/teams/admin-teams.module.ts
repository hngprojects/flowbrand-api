import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminTeam } from './entities/admin-team.entity';
import { TeamMembership } from './entities/team-membership.entity';
import { TeamInvitation } from './entities/team-invitation.entity';
import { AdminTeamModelAction } from './actions/admin-team.action';
import { TeamMembershipModelAction } from './actions/team-membership.action';
import { TeamInvitationModelAction } from './actions/team-invitation.action';
import { AdminTeamsController } from './admin-teams.controller';
import { AdminTeamsService } from './admin-teams.service';
import { EmailService } from '../../../email/email.service';
import { QueueModule } from '../../../queue/queue.module';
import { User } from '../../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminTeam, TeamMembership, TeamInvitation, User]),
    QueueModule,
  ],
  controllers: [AdminTeamsController],
  providers: [
    AdminTeamModelAction,
    TeamMembershipModelAction,
    TeamInvitationModelAction,
    AdminTeamsService,
    EmailService,
  ],
  exports: [AdminTeamsService],
})
export class AdminTeamsModule {}