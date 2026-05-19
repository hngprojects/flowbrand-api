import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type {
  UploadDocumentStatus,
  UploadFileType,
} from '../upload.types';

/**
 * Funnel upload metadata — matches ERD `uploaded_documents`.
 * File bytes live in object storage at `storage_path`.
 */
@Entity('uploaded_documents')
export class UploadedDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  file_name: string;

  @Column({ type: 'bigint', name: 'file_size_bytes' })
  file_size_bytes: string;

  @Column({ type: 'varchar', length: 50, name: 'file_type', nullable: true })
  file_type: UploadFileType | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  status: UploadDocumentStatus | null;

  @Column({ type: 'int', name: 'percent_complete', nullable: true })
  percent_complete: number | null;

  @Column({ type: 'text', name: 'storage_path' })
  storage_path: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
