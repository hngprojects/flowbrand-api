import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException, 
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminTeamModelAction } from './actions/admin-team.action';
import { TeamMembershipModelAction } from './actions/team-membership.action';
import { TeamInvitationModelAction } from './actions/team-invitation.action';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMembersDto } from './dto/invite-members.dto';
import { EmailService } from '../../../email/email.service';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import * as SYS_MSG from '../../../constants/system.messages';
import { PaginationDto } from '../../users/dto/pagination.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteStatus } from './enums/invite-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserModelAction } from '../../users/actions/user.action';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { RedisService } from '../../redis/redis.service';
import { AdminAuthService } from '../auth/admin-auth.service';
import { redisKeys } from '../../../constants/redis-keys';

export interface InviteResult {
  email: string;
  status: 'sent' | 'failed';
  reason?: string;
}

// Maps role strings (stored in team_invitations.role) to UserRole enum values.
// TODO: confirm final mapping with team once role taxonomy is finalised (BE-ADM-606).
const ROLE_PRIORITY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 2,
  [UserRole.ADMIN]: 1,
  [UserRole.USER]: 0,
};

const BCRYPT_INVITE_ROUNDS = 12;

@Injectable()
export class AdminTeamsService {
  constructor(
    private readonly adminTeamModelAction: AdminTeamModelAction,
    private readonly teamMembershipModelAction: TeamMembershipModelAction,
    private readonly teamInvitationModelAction: TeamInvitationModelAction,
    private readonly userModelAction: UserModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly userSessionModelAction: UserSessionModelAction,
    private readonly redisService: RedisService,
    private readonly adminAuthService: AdminAuthService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLoggerService,
    private readonly dataSource: DataSource,
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

        const appUrl = process.env.FRONTEND_URL;
        
        if (!appUrl) {
          throw new InternalServerErrorException('FRONTEND_URL is not configured')
        }

        const inviteLink = `${appUrl}/accept-invite?token=${rawToken}`

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

  async acceptInvite(dto: AcceptInviteDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const invitation = await this.teamInvitationModelAction.findByTokenHash(tokenHash);

    if (!invitation) {
      throw new BadRequestException(SYS_MSG.INVITE_TOKEN_INVALID);
    }

    if (
      invitation.status === InviteStatus.ACCEPTED ||
      invitation.status === InviteStatus.REVOKED
    ) {
      throw new BadRequestException(SYS_MSG.INVITE_ALREADY_USED);
    }

    if (invitation.expires_at < new Date()) {
      throw new BadRequestException(SYS_MSG.INVITE_EXPIRED);
    }

    if (!Object.values(UserRole).includes(invitation.role as UserRole)) {
      throw new BadRequestException(SYS_MSG.INVITE_TOKEN_INVALID);
    }
    const inviteRole = invitation.role as UserRole;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_INVITE_ROUNDS);

    let userId: string;
    let userEmail: string;
    let userFullName: string;

    await this.dataSource.transaction(async (manager) => {
      const claimed = await this.teamInvitationModelAction.claimWithManager(
        invitation.id,
        manager,
      );

      if (!claimed) {
        this.logger.warn('admin.team.invite.claim_failed', {
          inviteId: invitation.id,
          reason: 'Already claimed or expired',
        });
        throw new BadRequestException(SYS_MSG.INVITE_ALREADY_USED);
      }

      let user = await this.userModelAction.findByEmail(invitation.email);

      if (!user) {
        user = await this.userModelAction.create({
          createPayload: {
            email: invitation.email,
            full_name: dto.full_name,
            password_hash: passwordHash,
            is_verified: true,  
            is_active: true,
            termsAccepted: true,
            roles: [],
          },
          transactionOptions: { useTransaction: false },
        });

        this.logger.info('admin.team.invite.user_created', {
          userId: user.id,
          email: invitation.email,
          teamId: invitation.team_id,
        });
      } else {
        this.logger.info('admin.team.invite.user_linked', {
          userId: user.id,
          email: invitation.email,
          teamId: invitation.team_id,
        });
      }

      const currentRole = await this.userRoleModelAction.resolveHighestRole(user.id);

      if (!currentRole || this.getRolePriority(inviteRole) > this.getRolePriority(currentRole)) {
        await this.userRoleModelAction.create({
          createPayload: { user_id: user.id, role: inviteRole },
          transactionOptions: { useTransaction: false },
        });

        this.logger.info('admin.team.invite.role_assigned', { userId: user.id, role: inviteRole });
      }

      const existingMembership = await this.teamMembershipModelAction.findByTeamAndUserWithManager(
        invitation.team_id,
        user.id,
        manager,
      );

      if (!existingMembership) {
        await this.teamMembershipModelAction.createMembershipWithManager(
          invitation.team_id,
          user.id,
          invitation.role,
          manager,
        );
      }

      userId = user.id;
      userEmail = user.email;
      userFullName = user.full_name;
    });

    const tokens = await this.adminAuthService.issueTokensForInvite(
      userId!,
      userEmail!,
      inviteRole,
    );

    this.logger.info('admin.team.invite.accepted', {
      userId: userId!,
      teamId: invitation.team_id,
      inviteId: invitation.id,
    });

    return {
      accessToken: tokens.accessToken,
      user: {
        id: userId!,
        full_name: userFullName!,
        email: userEmail!,
        role: inviteRole,
      },
    };
  }

  async revokeMember(teamId: string, memberId: string, requestingUserId: string): Promise<void> {
    if (memberId === requestingUserId) {
      throw new ForbiddenException(SYS_MSG.MEMBER_REVOKE_SELF_FORBIDDEN);
    }

    const membership = await this.teamMembershipModelAction.findByTeamAndUser(teamId, memberId);

    if (!membership) {
      throw new NotFoundException(SYS_MSG.MEMBER_NOT_FOUND);
    }

    await this.teamMembershipModelAction.deleteMembership(teamId, memberId);

    const revokedSessionIds = await this.userSessionModelAction.revokeAllUserSessionsInDb(memberId);

    if (revokedSessionIds.length > 0) {
      await Promise.all(
        revokedSessionIds.flatMap((sessionId) => [
          this.redisService.del(redisKeys.activeSession(memberId, sessionId)),
          this.redisService.del(redisKeys.session(memberId, sessionId)),
        ]),
      );
    }

    this.logger.info('admin.team.member.revoked', {
      teamId,
      memberId,
      revokedBy: requestingUserId,
      sessionsRevoked: revokedSessionIds.length,
    });
  }

  private getRolePriority(role: UserRole): number {
    return ROLE_PRIORITY[role] ?? -1;
  }
}