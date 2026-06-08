import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TeamInvitation } from '../entities/team-invitation.entity';
import { InviteStatus } from '../enums/invite-status.enum';

@Injectable()
export class TeamInvitationModelAction extends AbstractModelAction<TeamInvitation> {
  constructor(
    @InjectRepository(TeamInvitation)
    repository: Repository<TeamInvitation>,
  ) {
    super(repository, TeamInvitation);
  }

  async findPendingByEmailAndTeam(email: string, teamId: string): Promise<TeamInvitation | null> {
    const normalizedEmail= email.trim().toLowerCase();
    return this.repository.findOne({
      where: { email: normalizedEmail, team_id: teamId, status: InviteStatus.PENDING },
    });
  }

  async findPendingByTeamId(teamId: string): Promise<TeamInvitation[]> {
    return this.repository.find({
      where: { team_id: teamId, status: InviteStatus.PENDING },
      select: ['id', 'email', 'role', 'expires_at', 'created_at'],
      order: { created_at: 'DESC' },
    });
  }

  async createInvitation(
    teamId: string,
    email: string,
    role: string,
    invitedBy: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<TeamInvitation> {
    const normalizedEmail = email.trim().toLowerCase()
    const invitation = this.repository.create({
      team_id: teamId,
      email: normalizedEmail,
      role,
      invited_by: invitedBy,
      token_hash: tokenHash,
      status: InviteStatus.PENDING,
      expires_at: expiresAt,
    });
    return this.repository.save(invitation);
  }

  async revokeInvitation(inviteId: string): Promise<void> {
    await this.repository.update(inviteId, { status: InviteStatus.REVOKED });
  }

  async findPendingInvitationById(teamId: string, inviteId: string): Promise<TeamInvitation | null> {
    return this.repository.findOne({
      where: { id: inviteId, team_id: teamId, status: InviteStatus.PENDING },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<TeamInvitation | null> {
    return this.repository.findOne({ 
      where: { 
        token_hash: tokenHash,
      } 
    });
  }

  async markAccepted(inviteId: string): Promise<void> {
    await this.repository.update(inviteId, { status: InviteStatus.ACCEPTED });
  }
  
  async claimWithManager(inviteId: string, manager: EntityManager): Promise<boolean> {
    const result = await manager.getRepository(TeamInvitation).update(
      { id: inviteId, status: InviteStatus.PENDING },
      { status: InviteStatus.ACCEPTED },
    );
    return (result.affected ?? 0) > 0;
  }
}