import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamMembership } from '../entities/team-membership.entity';

@Injectable()
export class TeamMembershipModelAction extends AbstractModelAction<TeamMembership> {
  constructor(
    @InjectRepository(TeamMembership)
    repository: Repository<TeamMembership>,
  ) {
    super(repository, TeamMembership);
  }

  async isUserMemberOfTeam(teamId: string, email: string): Promise<boolean> {
    const membership = await this.repository
      .createQueryBuilder('m')
      .innerJoin('m.user', 'u')
      .where('m.team_id = :teamId', { teamId })
      .andWhere('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
    return !!membership;
  }

  async findMemberCountByTeamId(teamId: string): Promise<number> {
    return this.repository.count({
      where: { team_id: teamId },
    });
  }

  async createMembership(
    teamId: string,
    userId: string,
    role: string,
  ): Promise<TeamMembership> {
    const membership = this.repository.create({
      team_id: teamId,
      user_id: userId,
      role,
      joined_at: new Date(),
    });
    return this.repository.save(membership);
  }

  async findByTeamAndUser(teamId: string, userId: string,): Promise<TeamMembership | null> {
    return this.repository.findOne({
      where: { team_id: teamId, user_id: userId },
    });
  }

  async deleteMembership(teamId: string, userId: string): Promise<void> {
    await this.repository.delete({ team_id: teamId, user_id: userId });
  }
}