import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';

@Injectable()
export class SubscriptionModelAction extends AbstractModelAction<Subscription> {
  constructor(@InjectRepository(Subscription) repository: Repository<Subscription>) {
    super(repository, Subscription);
  }
}
