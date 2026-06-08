import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../redis/redis.module';
import { PaymentModelAction } from './actions/payment.model-action';
import { SubscriptionModelAction } from './actions/subscription.model-action';
import { MockPaymentAdapter } from './adapters/mock-payment.adapter';
import { PaystackPaymentAdapter } from './adapters/paystack-payment.adapter';
import { PaystackClientProvider } from './providers/paystack-client.provider';
import { Payment } from './entities/payment.entity';
import { Subscription } from './entities/subscription.entity';
import { PaymentRateLimitGuard } from './guards/payment-rate-limit.guard';
import { SubscriptionRateLimitGuard } from './guards/subscription-rate-limit.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Subscription]), RedisModule],
  controllers: [PaymentsController],
  providers: [PaymentModelAction, SubscriptionModelAction, MockPaymentAdapter, PaystackClientProvider, PaystackPaymentAdapter, PaymentRateLimitGuard, SubscriptionRateLimitGuard, PaymentsService],
  exports: [PaymentsService, PaymentModelAction],
})
export class PaymentsModule {}
