import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { Subscription } from './subscription.entity';

@Entity('payments')
@Index('IDX_payments_user_id', ['user_id'])
// Partial unique — provider_reference is null until the gateway responds, but once set it must be unique
@Index('IDX_payments_provider_reference', ['provider_reference'], { unique: true, where: '"provider_reference" IS NOT NULL' })
@Index('IDX_payments_idempotency_key', ['idempotency_key'], { unique: true })
export class Payment extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Links renewal charges back to their subscription; null for one-time payments
  @Column({ type: 'uuid', nullable: true })
  subscription_id: string | null;

  @ManyToOne(() => Subscription, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription | null;

  @Column({ type: 'enum', enum: PaymentType })
  payment_type: PaymentType;

  @Column({ type: 'enum', enum: PaymentPlan })
  plan: PaymentPlan;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  provider_reference: string | null;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar' })
  idempotency_key: string;

  // SEC-02: only last 4 digits and brand stored — no card_number, cvv, or expiry
  @Column({ type: 'varchar', length: 4, nullable: true })
  card_last4: string | null;

  @Column({ type: 'varchar', nullable: true })
  card_brand: string | null;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;
}
