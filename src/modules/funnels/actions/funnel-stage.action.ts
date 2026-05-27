import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelStage } from '../entities/funnel-stage.entity';

@Injectable()
export class FunnelStageModelAction extends AbstractModelAction<FunnelStage> {
  constructor(
    @InjectRepository(FunnelStage)
    repository: Repository<FunnelStage>,
  ) {
    super(repository, FunnelStage);
  }

  async getStagesByFunnelId(funnelId: string): Promise<FunnelStage[]> {
    return this.repository.createQueryBuilder('s')
      .where('s.funnel_id = :funnelId', { funnelId })
      .orderBy('s.position', 'ASC')
      .getMany();
  }

  async getStagesWithTasks(funnelId: string): Promise<FunnelStage[]> {
    return this.repository.createQueryBuilder('s')
      .where('s.funnel_id = :funnelId', { funnelId })
      .orderBy('s.position', 'ASC')
      .leftJoinAndSelect('s.tasks', 't')
      .addOrderBy('t.position', 'ASC')
      .getMany();
  }
}