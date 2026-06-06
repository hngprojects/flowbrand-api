import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentType } from '../enums/payment-type.enum';

export interface InitiatePaymentDto {
  plan: PaymentPlan;
  type: PaymentType;
}
