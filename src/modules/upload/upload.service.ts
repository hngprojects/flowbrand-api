import {
  Inject,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JOBS, QUEUES } from '../../common/constants/queue.constants';
import * as SYS_MSG from '../../constants/system.messages';
import { redisKeys } from '../../constants/redis-keys';
import { RedisService } from '../redis/redis.service';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import { ALLOWED_UPLOAD_RULES, MAX_UPLOAD_BYTES, UPLOAD_PROGRESS } from './constants/upload.constants';
import { UploadFileConstraints } from './dto/upload-files.dto';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadDocumentStatus } from './upload.types';
import {
  UPLOAD_OBJECT_STORAGE,
  type FileValidationResult,
  type ObjectStorage,
  type UploadBatchResponse,
  type UploadItemResponse,
  type UploadProgressResponse,
  type UploadFileType,
} from './upload.types';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  constructor(
    private readonly uploadedDocumentAction: UploadedDocumentModelAction,
    @InjectQueue(QUEUES.DOCUMENT_EXTRACTION)
    private readonly extractionQueue: Queue,
    @Inject(UPLOAD_OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorage,
    private readonly redisService: RedisService,
  ) {}

  async handleUpload(userId: string, files: Express.Multer.File[] | undefined): Promise<UploadBatchResponse> {
    const { exceeded } = await this.redisService.rateLimit(redisKeys.uploadRateLimit(userId), 20, 3600);
    if (exceeded) {
      throw new HttpException(SYS_MSG.UPLOAD_RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!files?.length) {
      throw new UnprocessableEntityException({
        error: 'UnprocessableEntityException',
        message: SYS_MSG.FUNNEL_UPLOAD_FILES_REQUIRED,
      });
    }

    if (files.length > UploadFileConstraints.MAX_FILES) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: SYS_MSG.UPLOAD_TOO_MANY_FILES,
      });
    }

    const batchId = randomUUID();
    const uploads = await Promise.all(files.map((file, index) => this.processOneFile(userId, file, index)));

    const acceptedCount = uploads.filter((item) => item.uploadId).length;
    if (acceptedCount === 0) {
      throw new UnprocessableEntityException({
        error: 'UnprocessableEntityException',
        message: SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED,
        details: uploads.map((item, index) => ({
          index,
          fileName: item.fileName,
          errorMessage: item.errorMessage,
          fields: item.errorFields,
        })),
      });
    }
    const allAccepted = acceptedCount === uploads.length;
    return {
      message: allAccepted ? SYS_MSG.FUNNEL_UPLOAD_COMPLETED : SYS_MSG.FUNNEL_UPLOAD_PARTIAL,
      batchId,
      uploads,
    };
  }
  async getProgress(userId: string, uploadId: string): Promise<UploadProgressResponse> {
    const row = await this.uploadedDocumentAction.findOwnedById(uploadId, userId);
    if (!row) {
      throw new NotFoundException({
        error: 'NotFoundException',
        message: SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND,
      });
    }
    return this.mapRowToProgress(row);
  }
  private async processOneFile(userId: string, file: Express.Multer.File, index: number): Promise<UploadItemResponse> {
    const validation = await this.validateFile(file);
    if (!validation.ok) {
      this.cleanupTempFile(file.path);
      return {
        fileName: file.originalname,
        fileSizeBytes: file.size,
        status: UploadDocumentStatus.FAILED,
        percentComplete: 0,
        errorMessage: validation.errorMessage,
        errorFields: validation.errorFields,
      };
    }
    const fileType = validation.fileType;
    const uploadId = randomUUID();
    const storagePath = this.buildStoragePath(userId, uploadId, fileType);
    let row: UploadedDocument | null = null;
    let objectWritten = false;
    try {
      row = await this.uploadedDocumentAction.createDocument({
        id: uploadId,
        user_id: userId,
        file_name: file.originalname,
        file_size_bytes: String(file.size),
        file_type: fileType,
        status: UploadDocumentStatus.UPLOADING,
        percent_complete: UPLOAD_PROGRESS.START,
        storage_path: storagePath,
        parsed_text: null,
      });

      const fileStream = fs.createReadStream(file.path);

      await this.objectStorage.putObject({
        storagePath,
        body: fileStream,
        contentType: file.mimetype,
        contentLength: file.size,
      });
      objectWritten = true;
      this.cleanupTempFile(file.path);

      await this.withDbRetry(
        () => this.uploadedDocumentAction.updateProgress(uploadId, UPLOAD_PROGRESS.STORED),
        `uploadId=${uploadId} storagePath=${storagePath}`,
      );

      row.status = UploadDocumentStatus.PARSING;
      row.percent_complete = UPLOAD_PROGRESS.PARSING;
      const parsing = await this.withDbRetry(
        () => this.uploadedDocumentAction.saveDocument(row!),
        `uploadId=${uploadId} storagePath=${storagePath}`,
      );

      // FR-06: Do NOT wait for extraction. Dispatch extraction job.
      await this.extractionQueue.add(JOBS.EXTRACT_TEXT, {
        uploadId,
        userId,
        fileType,
        storagePath,
      });

      // AC-01: 201 always signals 'uploading' — the client polls GET /progress for actual state.
      return { ...this.mapRowToUploadItem(parsing), status: UploadDocumentStatus.UPLOADING };
    } catch (error) {
      this.logger.warn(
        `Upload failed for file index=${index} name=${file.originalname}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.cleanupTempFile(file.path);
      await this.rollbackSingleUpload(storagePath, row, objectWritten);
      return {
        fileName: file.originalname,
        fileType,
        fileSizeBytes: file.size,
        status: UploadDocumentStatus.FAILED,
        percentComplete: 0,
        errorMessage: SYS_MSG.UPLOAD_FAILED,
      };
    }
  }

  private cleanupTempFile(filePath?: string): void {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) this.logger.error(`Failed to delete temp file ${filePath}`, err);
      });
    }
  }
  private buildStoragePath(userId: string, uploadId: string, fileType: UploadFileType): string {
    return path.posix.join('uploads', userId, `${uploadId}.${fileType}`);
  }
  private async validateFile(file: Express.Multer.File): Promise<FileValidationResult> {
    
    const dtoError = UploadFileConstraints.validate(file);
    if (dtoError) {
      return { ok: false, errorMessage: dtoError };
    }

    if (file.path) {
      try {
        const { size: diskSize } = fs.statSync(file.path);
        if (diskSize !== file.size) {
          return { ok: false, errorMessage: SYS_MSG.UPLOAD_INTERRUPTED };
        }
      } catch {
        return { ok: false, errorMessage: SYS_MSG.UPLOAD_INTERRUPTED };
      }
    }

    if (file.size === 0) {
      return { ok: false, errorMessage: 'Uploaded file is empty.' };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        errorMessage: SYS_MSG.UPLOAD_FILE_TOO_LARGE,
        errorFields: { file: { actualSize: file.size, maxSize: MAX_UPLOAD_BYTES } },
      };
    }

    const extension = path.extname(file.originalname).toLowerCase() || 'none';

    let fileType: UploadFileType | null;
    try {
      fileType = await this.detectFileType(file);
    } catch (error) {
      this.logger.warn(
        `File validation failed for ${file.originalname}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        errorMessage: SYS_MSG.UPLOAD_INVALID_FILE,
        errorFields: { file: { extension } },
      };
    }

    if (!fileType) {
      return {
        ok: false,
        errorMessage: SYS_MSG.UPLOAD_INVALID_FILE,
        errorFields: { file: { extension } },
      };
    }
    return { ok: true, fileType };
  }

  private async detectFileType(file: Express.Multer.File): Promise<UploadFileType | null> {
    const extension = path.extname(file.originalname).toLowerCase();
    const candidates = (
      Object.entries(ALLOWED_UPLOAD_RULES) as [UploadFileType, (typeof ALLOWED_UPLOAD_RULES)[UploadFileType]][]
    ).filter(([, rule]) => rule.ext === extension);

    if (candidates.length === 0) {
      return null;
    }

    const buffer = await this.peekFile(file.path, 8);

    for (const [fileType, rule] of candidates) {
      if (!rule.mimes.includes(file.mimetype)) {
        continue;
      }
      if (this.bufferMatchesFileType(buffer, fileType)) {
        return fileType;
      }
    }
    return null;
  }

  private async peekFile(filePath: string | undefined, bytes: number): Promise<Buffer> {
    if (!filePath) return Buffer.alloc(0);
    return new Promise((resolve) => {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(bytes);
      try {
        fs.readSync(fd, buffer, 0, bytes, 0);
        resolve(buffer);
      } catch (err) {
        // Log so silent read failures are traceable in the upload validation flow.
        this.logger.warn(`peekFile failed for ${filePath}`, err instanceof Error ? err.stack : String(err));
        resolve(Buffer.alloc(0));
      } finally {
        fs.closeSync(fd);
      }
    });
  }
  private bufferMatchesFileType(buffer: Buffer, fileType: UploadFileType): boolean {
    if (fileType === 'pdf') {
      return buffer.length >= 5 && buffer.subarray(0, 5).toString('utf8') === '%PDF-';
    }
    if (buffer.length < 4) {
      return false;
    }
    if (fileType === 'docx' || fileType === 'pptx') {
      return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    }
    if (fileType === 'doc' || fileType === 'ppt') {
      return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    }
    return false;
  }
  private async rollbackSingleUpload(
    storagePath: string,
    row: UploadedDocument | null,
    objectWritten: boolean,
  ): Promise<void> {
    if (objectWritten) {
      try {
        await this.objectStorage.deleteObject(storagePath);
      } catch {
        /* best-effort cleanup */
      }
    }
    if (row) {
      try {
        await this.uploadedDocumentAction.deleteById(row.id);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
  private mapRowToUploadItem(row: UploadedDocument): UploadItemResponse {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSizeBytes: Number(row.file_size_bytes),
      status: row.status,
      percentComplete: row.percent_complete,
    };
  }
  private async withDbRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = 3,
    delayMs = 1000,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    this.logger.error({
      event: 'orphan_upload',
      message: `DB update failed after ${maxRetries} attempts — storage object may be orphaned`,
      context,
    });
    throw lastErr;
  }

  private mapRowToProgress(row: UploadedDocument): UploadProgressResponse {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSizeBytes: Number(row.file_size_bytes),
      status: row.status,
      percentComplete: row.percent_complete,
      uploadedAt: row.created_at.toISOString(),
      failureReason: row.failure_reason,
    };
  }
}
