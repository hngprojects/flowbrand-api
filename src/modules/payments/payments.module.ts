import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentModelAction } from './actions/payment.model-action';
import { SubscriptionModelAction } from './actions/subscription.model-action';
import { MockPaymentAdapter } from './adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from './adapters/paystack-payment.adapter';
import { Payment } from './entities/payment.entity';
import { Subscription } from './entities/subscription.entity';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Subscription])],
  providers: [PaymentModelAction, SubscriptionModelAction, MockPaymentAdapter, PaystackPaymentAdapter, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
