import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';

@Injectable()
export class PaymentModelAction extends AbstractModelAction<Payment> {
  constructor(@InjectRepository(Payment) repository: Repository<Payment>) {
    super(repository, Payment);
  }
}
