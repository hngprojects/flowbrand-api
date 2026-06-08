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
import { EmailModule } from '../../../email/email.module';
import { QueueModule } from '../../../queue/queue.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { User } from '../../users/entities/user.entity';
import { UserModelAction } from '../../users/actions/user.action';
import { UserRoleModelAction }     from '../../users/actions/user-role.action';
import { UserSessionModelAction }  from '../../users/actions/user-session.action';
import { RedisModule }             from '../../redis/redis.module';
import { UserRoleEntity }          from '../../users/entities/user-role.entity';
import { UserSession }             from '../../users/entities/user-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminTeam, TeamMembership, TeamInvitation, User, UserRoleEntity, UserSession]),
    QueueModule,
    EmailModule,
    AdminAuthModule,
    RedisModule, 
  ],
  controllers: [AdminTeamsController],
  providers: [
    AdminTeamModelAction,
    TeamMembershipModelAction,
    TeamInvitationModelAction,
    AdminTeamsService,
    UserModelAction, 
    UserRoleModelAction, 
    UserSessionModelAction
  ],
  exports: [AdminTeamsService],
})
export class AdminTeamsModule {}