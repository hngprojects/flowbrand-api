import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentType } from '../enums/payment-type.enum';

export class InitiatePaymentDto {
  @ApiProperty({ enum: PaymentPlan })
  @IsEnum(PaymentPlan)
  plan: PaymentPlan;

  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType)
  type: PaymentType;
}
