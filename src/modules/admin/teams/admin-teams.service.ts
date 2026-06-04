import * as crypto from 'crypto';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminTeamModelAction } from './actions/admin-team.action';
import { TeamMembershipModelAction } from './actions/team-membership.action';
import { TeamInvitationModelAction } from './actions/team-invitation.action';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMembersDto } from './dto/invite-members.dto';
import { EmailService } from '../../../email/email.service';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import * as SYS_MSG from '../../../constants/system.messages';
import { PaginationDto } from '../../users/dto/pagination.dto';

export interface InviteResult {
  email: string;
  status: 'sent' | 'failed';
  reason?: string;
}

@Injectable()
export class AdminTeamsService {
  constructor(
    private readonly adminTeamModelAction: AdminTeamModelAction,
    private readonly teamMembershipModelAction: TeamMembershipModelAction,
    private readonly teamInvitationModelAction: TeamInvitationModelAction,
    private readonly emailService: EmailService,
    private readonly logger: PinoLoggerService,
  ) {}

  async findAll(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;

    const [teams, total] = await this.adminTeamModelAction.findActiveTeamsPaginated(page, limit);

    const teamIds = teams.map((t) => t.id);
    const countMap = await this.adminTeamModelAction.getTeamMemberCounts(teamIds);

    const data = teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      created_at: t.created_at,
      member_count: countMap.get(t.id) ?? 0,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async create(dto: CreateTeamDto, createdBy: string) {
    const team = await this.adminTeamModelAction.createTeam(
      dto.name,
      dto.description ?? null,
      createdBy,
    );

    this.logger.info('admin.team.created', {
      teamId: team.id,
      teamName: team.name,
      createdBy,
    });

    return team;
  }

  async softDelete(teamId: string, deletedBy: string): Promise<void> {
    const team = await this.adminTeamModelAction.findActiveTeamById(teamId);

    if (!team) {
      throw new NotFoundException(SYS_MSG.TEAM_NOT_FOUND);
    }

    await this.adminTeamModelAction.softDeleteTeam(teamId);

    this.logger.info('admin.team.soft_deleted', {
      teamId,
      teamName: team.name,
      deletedBy,
    });
  }

  async inviteMembers(
    teamId: string,
    dto: InviteMembersDto,
    invitedBy: string,
  ): Promise<{ sent: number; failed: number; errors: InviteResult[] }> {
    const team = await this.adminTeamModelAction.findActiveTeamById(teamId);

    if (!team) {
      throw new NotFoundException(SYS_MSG.TEAM_NOT_FOUND);
    }

    const results: InviteResult[] = [];

    for (const email of dto.emails) {
      try {
        const existingInvite = await this.teamInvitationModelAction.findPendingByEmailAndTeam(email, teamId);
        if (existingInvite) {
          results.push({ email, status: 'failed', reason: SYS_MSG.TEAM_INVITE_ALREADY_PENDING });
          continue;
        }

        const isMember = await this.teamMembershipModelAction.isUserMemberOfTeam(teamId, email);
        if (isMember) {
          results.push({ email, status: 'failed', reason: SYS_MSG.TEAM_ALREADY_MEMBER });
          continue;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.teamInvitationModelAction.createInvitation(
          teamId,
          email,
          dto.role,
          invitedBy,
          tokenHash,
          expiresAt,
        );

        const inviteLink = `${process.env.APP_URL}/accept-invite?token=${rawToken}`;

        await this.emailService.sendTeamInvite(email, {
          inviteLink,
          role: dto.role,
          teamName: team.name,
          customMessage: dto.message,
        });

        results.push({ email, status: 'sent' });
      } catch (err) {
        this.logger.error('admin.team.invite_failed', {
          teamId,
          email,
          error: (err as Error).message,
        });
        results.push({ email, status: 'failed', reason: 'Internal error' });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const errors = results.filter((r) => r.status === 'failed');

    this.logger.info('admin.team.invites.completed', {
      teamId,
      invitedBy,
      sent,
      failed,
    });

    return { sent, failed, errors };
  }

  async getInvitations(teamId: string) {
    const team = await this.adminTeamModelAction.findActiveTeamById(teamId);

    if (!team) {
      throw new NotFoundException(SYS_MSG.TEAM_NOT_FOUND);
    }

    return this.teamInvitationModelAction.findPendingByTeamId(teamId);
  }

  async revokeInvitation(teamId: string, inviteId: string): Promise<void> {
    const invite = await this.teamInvitationModelAction.findPendingInvitationById(teamId, inviteId);

    if (!invite) {
      throw new NotFoundException(SYS_MSG.TEAM_INVITATION_NOT_FOUND);
    }

    await this.teamInvitationModelAction.revokeInvitation(inviteId);

    this.logger.info('admin.team.invite.revoked', {
      teamId,
      inviteId,
      email: invite.email,
    });
  }
}