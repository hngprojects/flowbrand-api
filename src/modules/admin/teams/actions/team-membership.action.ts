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
}