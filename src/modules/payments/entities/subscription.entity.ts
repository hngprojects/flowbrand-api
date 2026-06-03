import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

// Partial unique index — one active subscription per user, but history rows are allowed
@Entity('subscriptions')
@Index('IDX_subscriptions_active_user', ['user_id'], { unique: true, where: '"status" = \'active\'' })
export class Subscription extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: PaymentPlan })
  plan: PaymentPlan;

  @Column({ type: 'enum', enum: BillingCycle })
  billing_cycle: BillingCycle;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', nullable: true })
  provider_customer_code: string | null;

  @Column({ type: 'varchar', nullable: true })
  provider_subscription_code: string | null;

  @Column({ type: 'timestamptz' })
  current_period_start: Date;

  @Column({ type: 'timestamptz' })
  current_period_end: Date;

  @Column({ type: 'boolean', default: false })
  cancel_at_period_end: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at: Date | null;
}
