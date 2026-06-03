import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { Payment } from './payment.entity';

// AC-10: one active subscription per user enforced at DB level
@Entity('subscriptions')
@Unique('UQ_subscriptions_user_id', ['user_id'])
export class Subscription extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  payment_id: string;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ type: 'enum', enum: PaymentPlan })
  plan: PaymentPlan;

  @Column({ type: 'enum', enum: BillingCycle })
  billing_cycle: BillingCycle;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', nullable: true })
  provider_subscription_code: string | null;

  @Column({ type: 'timestamptz' })
  current_period_start: Date;

  @Column({ type: 'timestamptz' })
  current_period_end: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;
}
