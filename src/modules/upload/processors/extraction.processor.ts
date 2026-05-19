import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import { UploadedDocumentModelAction } from '../actions/uploaded-document.action';
import { UPLOAD_PROGRESS } from '../constants/upload.constants';
import { DocumentTextExtractorService } from '../services/document-text-extractor.service';
import { UploadDocumentStatus, UPLOAD_OBJECT_STORAGE } from '../upload.types';
import type { ObjectStorage, UploadFileType } from '../upload.types';

export interface ExtractionJobPayload {
  uploadId: string;
  userId: string;
  fileType: UploadFileType;
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
    
    this.logger.log({ message: 'extraction_start', uploadId });

    const row = await this.uploadedDocumentAction.get({ identifierOptions: { id: uploadId } });
    if (!row) {
      throw new Error(`Upload record not found: ${uploadId}`);
    }

    try {
      const buffer = await this.objectStorage.getObject(storagePath);
      const parsedText = await this.documentTextExtractor.extract(buffer, fileType);

      row.parsed_text = parsedText;
      row.status = UploadDocumentStatus.READY;
      row.percent_complete = UPLOAD_PROGRESS.READY;
      row.failure_reason = null;
      await this.uploadedDocumentAction.saveDocument(row);

      this.logger.log({ message: 'extraction_complete', uploadId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ message: 'extraction_failed', uploadId, error: errorMessage });

      row.status = UploadDocumentStatus.FAILED;
      row.percent_complete = 0;
      row.failure_reason = errorMessage.substring(0, 200);
      await this.uploadedDocumentAction.saveDocument(row);
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<ExtractionJobPayload>): void {
    this.logger.log({ event: 'extraction_job_completed', jobId: job.id, uploadId: job.data.uploadId });
  }

  @OnQueueFailed()
  onFailed(job: Job<ExtractionJobPayload>, error: Error): void {
    this.logger.error({ event: 'extraction_job_failed', jobId: job.id, uploadId: job.data.uploadId, error: error.message });
  }
}
