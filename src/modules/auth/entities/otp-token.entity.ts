import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export const OTP_TOKEN_TYPES = ['email_verification', 'password_reset'] as const;
export type OtpTokenType = (typeof OTP_TOKEN_TYPES)[number];

@Entity('otp_tokens')
export class OtpToken extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: OTP_TOKEN_TYPES })
  type: OtpTokenType;

  @Column({ type: 'text' })
  token_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;
}
