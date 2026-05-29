import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadedDocument } from '../entities/uploaded-document.entity';
import { UploadDocumentStatus } from '../upload.types';

@Injectable()
export class UploadedDocumentModelAction extends AbstractModelAction<UploadedDocument> {
  constructor(
    @InjectRepository(UploadedDocument)
    private readonly uploadedDocumentRepository: Repository<UploadedDocument>,
  ) {
    super(uploadedDocumentRepository, UploadedDocument);
  }

  async createDocument(partial: Partial<UploadedDocument>): Promise<UploadedDocument> {
    const row = this.uploadedDocumentRepository.create(partial);
    return this.uploadedDocumentRepository.save(row);
  }

  async saveDocument(document: UploadedDocument): Promise<UploadedDocument> {
    return this.uploadedDocumentRepository.save(document);
  }

  async findOwnedById(uploadId: string, userId: string): Promise<UploadedDocument | null> {
    return this.uploadedDocumentRepository.findOne({
      select: {
        id: true,
        user_id: true,
        file_name: true,
        file_size_bytes: true,
        file_type: true,
        status: true,
        percent_complete: true,
        storage_path: true,
        failure_reason: true,
        created_at: true,
        updated_at: true,
      },
      where: { id: uploadId, user_id: userId },
    });
  }

  async markStaleParsing(olderThanMs: number): Promise<number> {
    const threshold = new Date(Date.now() - olderThanMs);
    const result = await this.uploadedDocumentRepository
      .createQueryBuilder()
      .update(UploadedDocument)
      .set({
        status: UploadDocumentStatus.FAILED,
        percent_complete: 0,
        failure_reason: 'Server restarted during extraction',
      })
      .where('status = :status', { status: UploadDocumentStatus.PARSING })
      .andWhere('updated_at < :threshold', { threshold })
      .execute();
    return result.affected ?? 0;
  }

  async deleteById(uploadId: string): Promise<void> {
    await this.uploadedDocumentRepository.delete({ id: uploadId });
  }

  async updateProgress(id: string, percent: number): Promise<void> {
    await this.uploadedDocumentRepository
      .createQueryBuilder()
      .update(UploadedDocument)
      .set({ percent_complete: percent })
      .where('id = :id', { id })
      .andWhere('percent_complete < :percent', { percent })
      .execute();
  }
}
