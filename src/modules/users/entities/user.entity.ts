import { Column, DeleteDateColumn, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserRoleEntity } from './user-role.entity';
import { AuthMetadata } from '../../auth/entities/auth-metadata.entity';
import { UserSession } from './user-session.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  full_name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Exclude()
  @Column({ type: 'text', nullable: true })
  password_hash: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'boolean', default: false })
  is_verified: boolean;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'varchar', length: 20, default: 'local' })
  auth_provider: string;

  @Column({ type: 'text', nullable: true })
  provider_user_id: string | null;

  @Column({ type: 'boolean', default: false, name: 'terms_accepted' })
  termsAccepted: boolean;

  @Column({ type: 'text', nullable: true })
  business_type: string | null;

  @Column({ type: 'text', nullable: true })
  target_customer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  primary_goal: string | null;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  // Relations
  @OneToMany(() => UserRoleEntity, (r) => r.user, { cascade: true })
  roles: UserRoleEntity[];

  @OneToOne(() => AuthMetadata, (m) => m.user, { cascade: true })
  auth_metadata: AuthMetadata;

  @OneToMany(() => UserSession, (s) => s.user, { cascade: true })
  sessions: UserSession[];
}
