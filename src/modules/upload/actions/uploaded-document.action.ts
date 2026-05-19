import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadedDocument } from '../entities/uploaded-document.entity';

@Injectable()
export class UploadedDocumentModelAction extends AbstractModelAction<UploadedDocument> {
  constructor(
    @InjectRepository(UploadedDocument)
    private readonly uploadedDocumentRepository: Repository<UploadedDocument>,
  ) {
    super(uploadedDocumentRepository, UploadedDocument);
  }

  async createDocument(
    partial: Partial<UploadedDocument>,
  ): Promise<UploadedDocument> {
    const row = this.uploadedDocumentRepository.create(partial);
    return this.uploadedDocumentRepository.save(row);
  }

  async saveDocument(document: UploadedDocument): Promise<UploadedDocument> {
    return this.uploadedDocumentRepository.save(document);
  }

  async findOwnedById(
    uploadId: string,
    userId: string,
  ): Promise<UploadedDocument | null> {
    return this.uploadedDocumentRepository.findOne({
      where: { id: uploadId, user_id: userId },
    });
  }

  async deleteById(uploadId: string): Promise<void> {
    await this.uploadedDocumentRepository.delete({ id: uploadId });
  }
}
