import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { UploadDocumentStatus, type UploadFileType } from '../upload.types';

/**
 * Funnel upload metadata — matches ERD `uploaded_documents`.
 * File bytes live in object storage at `storage_path`.
 */
@Entity('uploaded_documents')
export class UploadedDocument extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'bigint' })
  file_size_bytes: string;

  @Column({ type: 'varchar', length: 50 })
  file_type: UploadFileType;

  @Column({
    type: 'enum',
    enum: UploadDocumentStatus,
    default: UploadDocumentStatus.UPLOADING,
  })
  status: UploadDocumentStatus;

  @Column({ type: 'int', default: 0 })
  percent_complete: number;

  @Column({ type: 'text' })
  storage_path: string;

  /** Extracted plain text; set when status becomes `ready`. */
  @Column({ type: 'text', nullable: true })
  parsed_text: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
