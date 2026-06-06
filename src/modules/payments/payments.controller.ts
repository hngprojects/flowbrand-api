import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import * as SYS_MSG from '../../constants/system.messages';
import { PRICING } from './constants/pricing.constants';
import { InitiatePaymentDocs, InitiateSubscriptionDocs, VerifyPaymentDocs, WebhookDocs } from './docs/payments-swagger.doc';
import { InitiateSubscriptionRequestDto } from './dto/initiate-subscription-request.dto';
import { BillingCycle } from './enums/billing-cycle.enum';
import { PaymentPlan } from './enums/payment-plan.enum';
import { PaymentType } from './enums/payment-type.enum';
import { PaymentRateLimitGuard } from './guards/payment-rate-limit.guard';
import { SubscriptionRateLimitGuard } from './guards/subscription-rate-limit.guard';
import {
  InitiatePaymentResponse,
  InitiatePaymentResult,
  InitiateSubscriptionResponse,
  InitiateSubscriptionResult,
  PaymentVerifyResponse,
} from './interfaces/payment-provider.interface';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

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

  @Get('verify')
  @VerifyPaymentDocs()
  async verify(
    @Query('reference', new ParseUUIDPipe({ version: '4' })) reference: string,
    @CurrentUser('userId') userId: string,
  ): Promise<{ statusCode: number; message: string; data: PaymentVerifyResponse }> {
    const result = await this.paymentsService.resolvePayment(userId, reference);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.PAYMENT_VERIFIED_SUCCESSFULLY,
      data: result,
    };
  }

  @Post('webhook')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @WebhookDocs()
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-paystack-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);

    try {
      await this.paymentsService.processWebhookEvent(rawBody, signature);
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error({ message: 'Unexpected webhook error', error: (err as Error).message });
    }

    return { received: true };
  }

  @Post('subscriptions/initiate')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SubscriptionRateLimitGuard)
  @InitiateSubscriptionDocs()
  async initiateSubscription(
    @CurrentUser('userId') userId: string,
    @CurrentUser('email') email: string,
    @Body() body: InitiateSubscriptionRequestDto,
  ): Promise<InitiateSubscriptionResponse> {
    let result: InitiateSubscriptionResult;
    try {
      result = await this.paymentsService.initiateSubscription(userId, email, {
        plan: PaymentPlan.PRO,
        billingCycle: body.billingCycle,
      });
    } catch (err: unknown) {
      // ConflictException (409 idempotency) and PaymentFailedException (402) propagate unchanged.
      if (err instanceof HttpException) throw err;
      throw new BadGatewayException(SYS_MSG.PAYMENT_FAILED);
    }

    const amountKobo =
      body.billingCycle === BillingCycle.ANNUAL
        ? PRICING.PRO_ANNUAL_KOBO
        : PRICING.PRO_MONTHLY_KOBO;

    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.SUBSCRIPTION_INITIATED_SUCCESSFULLY,
      data: {
        authorizationUrl: result.authorizationUrl,
        amount: amountKobo,
        currency: 'NGN',
        billingCycle: body.billingCycle,
      },
    };
  }
}
