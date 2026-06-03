import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentPlan } from '../enums/payment-plan.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';

@Entity('payments')
@Index('IDX_payments_user_id', ['user_id'])
@Index('IDX_payments_provider_reference', ['provider_reference'])
export class Payment extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

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
