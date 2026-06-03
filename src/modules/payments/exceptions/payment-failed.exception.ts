import { UnprocessableEntityException } from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';

export class PaymentFailedException extends UnprocessableEntityException {
  constructor(reason?: string) {
    super({ message: SYS_MSG.PAYMENT_FAILED, reason });
  }
}
