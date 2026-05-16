import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export type OtpTokenType = 'email_verification' | 'password_reset';

@Entity('otp_tokens')
export class OtpToken extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  type: OtpTokenType;

  @Column({ type: 'text' })
  token_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;
}
