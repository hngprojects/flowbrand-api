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

  async findStagesByFunnelId(funnelId: string): Promise<FunnelStage[]> {
    return this.repository
      .createQueryBuilder('fs')
      .where('fs.funnel_id = :funnelId', { funnelId })
      .orderBy('fs.position', 'ASC')
      .getMany();
  }
}
