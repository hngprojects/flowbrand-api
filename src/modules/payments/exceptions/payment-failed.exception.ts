import { HttpException, HttpStatus } from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';

// 402 Payment Required — semantically correct for a provider decline or payment failure
export class PaymentFailedException extends HttpException {
  constructor(reason?: string) {
    super({ message: SYS_MSG.PAYMENT_FAILED, reason }, HttpStatus.PAYMENT_REQUIRED);
  }
}
