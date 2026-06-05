import {
  BadGatewayException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { PRICING } from './constants/pricing.constants';
import { InitiatePaymentDocs } from './docs/payments-swagger.doc';
import { PaymentPlan } from './enums/payment-plan.enum';
import { PaymentType } from './enums/payment-type.enum';
import { PaymentRateLimitGuard } from './guards/payment-rate-limit.guard';
import { InitiatePaymentResponse, InitiatePaymentResult } from './interfaces/payment-provider.interface';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PaymentRateLimitGuard)
  @InitiatePaymentDocs()
  async initiate(
    @CurrentUser('userId') userId: string,
    @CurrentUser('email') email: string,
  ): Promise<InitiatePaymentResponse> {
    // FR-2: plan guard enforced in PaymentRateLimitGuard before this method runs
    let result: InitiatePaymentResult;
    try {
      result = await this.paymentsService.initiatePayment(userId, email, {
        plan: PaymentPlan.PRO,
        type: PaymentType.ONE_TIME,
      });
    } catch (err: unknown) {
      // ConflictException (409) and PaymentFailedException (402) propagate unchanged.
      // Any other error is a provider/infrastructure failure → 502.
      if (err instanceof HttpException) throw err;
      throw new BadGatewayException(SYS_MSG.PAYMENT_FAILED);
    }

    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.PAYMENT_INITIATED_SUCCESSFULLY,
      data: {
        reference: result.reference,
        authorizationUrl: result.authorizationUrl,
        amount: PRICING.PRO_ONETIME_KOBO,
        currency: 'NGN',
      },
    };
  }
}
