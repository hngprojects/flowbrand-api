import { Process, Processor, OnQueueCompleted, OnQueueFailed, OnQueueStalled } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { env } from '../../../config/env'; // Import the environment config
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

  // Added concurrency configuration using the environment variable
  @Process({ name: JOBS.EXTRACT_TEXT, concurrency: env.QUEUE_CONCURRENCY })
  async handleExtraction(job: Job<ExtractionJobPayload>): Promise<void> {
    const { uploadId, fileType, storagePath } = job.data;

    this.logger.log({ message: 'extraction_start', uploadId });

    const row = await this.uploadedDocumentAction.get({ identifierOptions: { id: uploadId } });
    if (!row) {
      throw new Error(`Upload record not found: ${uploadId}`);
    }

    // Idempotency guard: skip if a previous attempt already reached a terminal state.
    // Bull may retry a job after a stall; without this the processor would overwrite a
    // successful READY record or loop a FAILED one unnecessarily.
    if (row.status === UploadDocumentStatus.READY || row.status === UploadDocumentStatus.FAILED) {
      this.logger.log({ message: 'extraction_skipped_already_terminal', uploadId, status: row.status });
      return;
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
  async onFailed(job: Job<ExtractionJobPayload>, error: Error): Promise<void> {
    this.logger.error({
      event: 'extraction_job_failed',
      jobId: job.id,
      uploadId: job.data.uploadId,
      attemptsMade: job.attemptsMade,
      error: error?.message,
    });

    // Safety net: if the processor's own catch block never ran (e.g. Bull exceeded
    // maxAttempts, the lock expired, or the process was killed mid-job), ensure the
    // row never stays stuck at PARSING. READY is terminal — never overwrite it.
    try {
      const row = await this.uploadedDocumentAction.get({ identifierOptions: { id: job.data.uploadId } });
      if (row && row.status !== UploadDocumentStatus.READY) {
        row.status = UploadDocumentStatus.FAILED;
        row.percent_complete = 0;
        row.failure_reason = (error?.message ?? 'Job failed').slice(0, 200);
        await this.uploadedDocumentAction.saveDocument(row);
      }
    } catch (dbErr) {
      this.logger.error({
        event: 'extraction_failed_db_reconciliation_error',
        uploadId: job.data.uploadId,
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    }
  }

  @OnQueueStalled()
  onStalled(job: Job<ExtractionJobPayload>): void {
    this.logger.warn({
      event: 'extraction_job_stalled',
      jobId: job.id,
      uploadId: job.data.uploadId,
      attemptsMade: job.attemptsMade,
    });
  }
}