import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import { UploadedDocumentModelAction } from '../actions/uploaded-document.action';
import { UPLOAD_PROGRESS } from '../constants/upload.constants';
import { DocumentTextExtractorService } from '../services/document-text-extractor.service';
import { UploadDocumentStatus, UPLOAD_OBJECT_STORAGE, ObjectStorage } from '../upload.types';
import { Inject } from '@nestjs/common';

export interface ExtractionJobPayload {
  uploadId: string;
  userId: string;
  fileType: any; // Using any for now to match the existing UploadFileType
  storagePath: string;
}

@Processor(QUEUES.DOCUMENT_EXTRACTION)
export class ExtractionProcessor {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(
    private readonly uploadedDocumentAction: UploadedDocumentModelAction,
    private readonly documentTextExtractor: DocumentTextExtractorService,
    @Inject(UPLOAD_OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorage,
  ) {}

  @Process(JOBS.EXTRACT_TEXT)
  async handleExtraction(job: Job<ExtractionJobPayload>): Promise<void> {
    const { uploadId, fileType, storagePath } = job.data;
    
    this.logger.log(`Starting extraction for uploadId=${uploadId}`);

    const row = await this.uploadedDocumentAction.get({ identifierOptions: { id: uploadId } });
    if (!row) {
      throw new Error(`Upload record not found: ${uploadId}`);
    }

    try {
      // 1. Fetch from storage
      const buffer = await this.objectStorage.getObject(storagePath);
      
      // 2. Extract text
      const parsedText = await this.documentTextExtractor.extract(buffer, fileType);
      
      // 3. Update DB - Success
      row.parsed_text = parsedText;
      row.status = UploadDocumentStatus.READY;
      row.percent_complete = UPLOAD_PROGRESS.READY;
      row.failure_reason = null;
      await this.uploadedDocumentAction.saveDocument(row);
      
      this.logger.log(`Extraction successful for uploadId=${uploadId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Extraction failed for uploadId=${uploadId}: ${errorMessage}`);
      
      // Update DB - Failure
      row.status = UploadDocumentStatus.FAILED;
      row.percent_complete = 0;
      row.failure_reason = errorMessage.substring(0, 200);
      await this.uploadedDocumentAction.saveDocument(row);
      
      // AC-08: Catch all exceptions so worker doesn't crash
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} completed for uploadId=${job.data.uploadId}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Job ${job.id} failed for uploadId=${job.data.uploadId}: ${error.message}`);
  }
}
