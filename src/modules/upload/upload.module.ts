import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UPLOAD_OBJECT_STORAGE } from './upload.types';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
import { MinioUploadStorageService } from './services/minio-upload-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([UploadedDocument])],
  controllers: [UploadController],
  providers: [
    UploadService,
    UploadedDocumentModelAction,
    DocumentTextExtractorService,
    MinioUploadStorageService,
    {
      provide: UPLOAD_OBJECT_STORAGE,
      useExisting: MinioUploadStorageService,
    },
  ],
  exports: [UploadService, UploadedDocumentModelAction],
})
export class UploadModule {}
