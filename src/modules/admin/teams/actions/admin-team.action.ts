import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminTeam } from '../entities/admin-team.entity';
import { TeamStatus } from '../enums/team-status.enum';
import { TeamMembership } from '../entities/team-membership.entity';

@Injectable()
export class AdminTeamModelAction extends AbstractModelAction<AdminTeam> {
  constructor(
    @InjectRepository(AdminTeam)
    repository: Repository<AdminTeam>,
  ) {
    super(repository, AdminTeam);
  }

  async findActiveTeamsPaginated(
    page: number,
    limit: number,
  ): Promise<[AdminTeam[], number]> {
    return this.repository.findAndCount({
      where: { status: TeamStatus.ACTIVE },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });
  }

  async findActiveTeamById(id: string): Promise<AdminTeam | null> {
    return this.repository.findOne({
      where: { id, status: TeamStatus.ACTIVE },
    });
  }

  async softDeleteTeam(id: string): Promise<void> {
    await this.repository.update(id, { status: TeamStatus.DELETED });
  }

  async createTeam(name: string, description: string | null, createdBy: string): Promise<AdminTeam> {
    const team = this.repository.create({
      name,
      description,
      created_by: createdBy,
      status: TeamStatus.ACTIVE,
    });
    return this.repository.save(team);
  }

  async getTeamMemberCounts(teamIds: string[]): Promise<Map<string, number>> {
    if (teamIds.length === 0) return new Map();

    const countRows = await this.repository.manager
      .createQueryBuilder(TeamMembership, 'm')
      .select('m.team_id', 'team_id')
      .addSelect('COUNT(m.id)', 'count')
      .where('m.team_id IN (:...teamIds)', { teamIds })
      .groupBy('m.team_id')
      .getRawMany<{ team_id: string; count: string }>();

    return new Map(countRows.map((r) => [r.team_id, Number(r.count)]));
  }
}