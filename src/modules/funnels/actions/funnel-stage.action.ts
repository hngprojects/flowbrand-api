import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelStage } from '../entities/funnel-stage.entity';

@Injectable()
export class FunnelStageModelAction extends AbstractModelAction<FunnelStage> {
  constructor(
    @InjectRepository(FunnelStage)
    private readonly funnelStageRepository: Repository<FunnelStage>,
  ) {
    super(funnelStageRepository, FunnelStage);
  }
}
