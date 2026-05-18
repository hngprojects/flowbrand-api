import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funnel } from '../entities/funnel.entity';

@Injectable()
export class FunnelModelAction extends AbstractModelAction<Funnel> {
  constructor(
    @InjectRepository(Funnel)
    repository: Repository<Funnel>,
  ) {
    super(repository, Funnel);
  }
}
