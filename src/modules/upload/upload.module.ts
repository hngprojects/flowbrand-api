import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from '../../common/constants/queue.constants';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UPLOAD_OBJECT_STORAGE } from './upload.types';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
import { MinioUploadStorageService } from './services/minio-upload-storage.service';
import { ExtractionProcessor } from './processors/extraction.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([UploadedDocument]),
    BullModule.registerQueue({
      name: QUEUES.DOCUMENT_EXTRACTION,
      settings: {
        // Text extraction on large documents can exceed Bull's default 30 s lock.
        // 120 s matches the upload file size limit (5 MiB at typical parse speeds).
        lockDuration: 120_000,
      },
    }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    UploadedDocumentModelAction,
    DocumentTextExtractorService,
    MinioUploadStorageService,
    ExtractionProcessor,
    {
      provide: UPLOAD_OBJECT_STORAGE,
      useExisting: MinioUploadStorageService,
    },
  ],
  exports: [UploadService, UploadedDocumentModelAction],
})
export class UploadModule {}
