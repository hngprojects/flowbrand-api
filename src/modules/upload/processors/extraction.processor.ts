import { Process, Processor, OnQueueCompleted, OnQueueFailed, OnQueueStalled } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { env } from '../../../config/env'; // Import the environment config
import { JOBS, QUEUES } from '../../../common/constants/queue.constants';
import { UploadedDocumentModelAction } from '../actions/uploaded-document.action';
import { EXTRACTION_LOCK_MS, UPLOAD_PROGRESS } from '../constants/upload.constants';
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

  // Fire 30 s before the Bull lock expires so the catch block can write FAILED cleanly
  // before Bull considers the job stalled.
  private static readonly EXTRACTION_TIMEOUT_MS = EXTRACTION_LOCK_MS - 30_000;

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

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      this.logger.log({ message: 'extraction_download_start', uploadId, storagePath });
      const buffer = await this.objectStorage.getObject(storagePath);

      this.logger.log({ message: 'extraction_parse_start', uploadId, fileType, bytes: buffer.length });
      const extractionTimeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Extraction timed out after ${ExtractionProcessor.EXTRACTION_TIMEOUT_MS / 1000}s`)),
          ExtractionProcessor.EXTRACTION_TIMEOUT_MS,
        );
        timeoutHandle.unref?.();
      });

      const parsedText = await Promise.race([
        this.documentTextExtractor.extract(buffer, fileType),
        extractionTimeout,
      ]);
      clearTimeout(timeoutHandle);

      row.parsed_text = parsedText;
      row.status = UploadDocumentStatus.READY;
      row.percent_complete = UPLOAD_PROGRESS.READY;
      row.failure_reason = null;
      await this.uploadedDocumentAction.saveDocument(row);

      this.logger.log({ message: 'extraction_complete', uploadId });
    } catch (error) {
      clearTimeout(timeoutHandle);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ message: 'extraction_failed', uploadId, attemptsMade: job.attemptsMade, error: errorMessage });
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<ExtractionJobPayload>): void {
    this.logger.log({ event: 'extraction_job_completed', jobId: job.id, uploadId: job.data.uploadId });
  }

  @OnQueueFailed()
  async onFailed(job: Job<ExtractionJobPayload>, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;

    this.logger.error({
      event: 'extraction_job_failed',
      jobId: job.id,
      uploadId: job.data.uploadId,
      attemptsMade: job.attemptsMade,
      maxAttempts,
      isFinalAttempt,
      error: error?.message,
    });

    // Only write FAILED on the last attempt. On intermediate failures Bull will
    // requeue the job — writing FAILED here would trip the idempotency guard and
    // prevent the retry from running. On the final attempt, or when no retries are
    // configured, this is the authoritative terminal write. READY is never overwritten.
    if (!isFinalAttempt) {
      return;
    }

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