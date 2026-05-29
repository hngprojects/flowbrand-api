import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from '../../common/constants/queue.constants';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import { EXTRACTION_LOCK_MS } from './constants/upload.constants';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UPLOAD_OBJECT_STORAGE } from './upload.types';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
import { MinioUploadStorageService } from './services/minio-upload-storage.service';
import { UploadRecoveryService } from './services/upload-recovery.service';
import { ExtractionProcessor } from './processors/extraction.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([UploadedDocument]),
    BullModule.registerQueue({
      name: QUEUES.DOCUMENT_EXTRACTION,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        // Keep completed jobs for 1 hour during the initial monitoring window
        // so extraction_format_complete timings can be correlated with job IDs.
        // Tighten to `true` once p95 baselines are established.
        removeOnComplete: { age: 3600 },
        removeOnFail: false,
      },
      settings: {
        lockDuration: EXTRACTION_LOCK_MS,
        stalledInterval: 30_000,
        maxStalledCount: 1,
      },
    }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    UploadedDocumentModelAction,
    DocumentTextExtractorService,
    MinioUploadStorageService,
    UploadRecoveryService,
    ExtractionProcessor,
    {
      provide: UPLOAD_OBJECT_STORAGE,
      useExisting: MinioUploadStorageService,
    },
  ],
  exports: [UploadService, UploadedDocumentModelAction, UPLOAD_OBJECT_STORAGE],
})
export class UploadModule {}
