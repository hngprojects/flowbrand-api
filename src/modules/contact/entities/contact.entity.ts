import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ContactStatus } from '../enums/contact-status.enum';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('contacts')
export class Contact extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  business_name: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: ContactStatus,
    default: ContactStatus.PENDING,
  })
  status: ContactStatus;
}
