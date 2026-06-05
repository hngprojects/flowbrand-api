import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { BillingCycle } from '../enums/billing-cycle.enum';

export class InitiateSubscriptionRequestDto {
  @ApiProperty({ enum: BillingCycle, example: BillingCycle.MONTHLY })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;
}
