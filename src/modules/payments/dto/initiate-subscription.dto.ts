import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';

export class InitiateSubscriptionDto {
  @ApiProperty({ enum: PaymentPlan })
  @IsEnum(PaymentPlan)
  plan: PaymentPlan;

  @ApiProperty({ enum: BillingCycle })
  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;
}
