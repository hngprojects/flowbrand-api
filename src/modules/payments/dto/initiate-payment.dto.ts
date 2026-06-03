import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsUUID } from 'class-validator';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentType } from '../enums/payment-type.enum';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: PaymentPlan })
  @IsEnum(PaymentPlan)
  plan: PaymentPlan;

  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType)
  type: PaymentType;
}
