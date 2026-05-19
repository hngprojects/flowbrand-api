import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as SYS_MSG from '../../constants/system.messages';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import {
  ALLOWED_UPLOAD_RULES,
  MAX_UPLOAD_BYTES,
} from './constants/upload.constants';
import { UploadedDocument } from './entities/uploaded-document.entity';
import {
  UPLOAD_OBJECT_STORAGE,
  type ObjectStorage,
  type UploadBatchResponse,
  type UploadItemResponse,
  type UploadProgressResponse,
  type UploadFileType,
} from './upload.types';

type FileValidationResult =
  | { ok: true; fileType: UploadFileType }
  | { ok: false; errorMessage: string };

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly uploadedDocumentAction: UploadedDocumentModelAction,
    @Inject(UPLOAD_OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorage,
  ) {}

  /**
   * Each file is validated and uploaded independently in parallel.
   * A failure on one file does not cancel the others.
   */
  async handleUpload(
    userId: string,
    files: Express.Multer.File[] | undefined,
  ): Promise<UploadBatchResponse> {
    if (!files?.length) {
      throw new BadRequestException({
        error: 'BadRequestException',
        message: SYS_MSG.FUNNEL_UPLOAD_FILES_REQUIRED,
      });
    }

    const batchId = randomUUID();
    const uploads = await Promise.all(
      files.map((file, index) => this.processOneFile(userId, file, index)),
    );

    const storedCount = uploads.filter((item) => item.status === 'stored').length;

    if (storedCount === 0) {
      throw new UnprocessableEntityException({
        error: 'UnprocessableEntityException',
        message: SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED,
        details: uploads.map((item, index) => ({
          index,
          fileName: item.fileName,
          errorMessage: item.errorMessage,
        })),
      });
    }

    const allStored = storedCount === uploads.length;

    return {
      statusCode: HttpStatus.CREATED,
      message: allStored
        ? SYS_MSG.FUNNEL_UPLOAD_COMPLETED
        : SYS_MSG.FUNNEL_UPLOAD_PARTIAL,
      data: { batchId, uploads },
    };
  }

  /** Owner-scoped progress for polling after POST /funnels/upload. */
  async getProgress(
    userId: string,
    uploadId: string,
  ): Promise<UploadProgressResponse> {
    const row = await this.uploadedDocumentAction.findOwnedById(
      uploadId,
      userId,
    );

    if (!row) {
      throw new NotFoundException({
        error: 'NotFoundException',
        message: SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND,
      });
    }

    return this.mapRowToProgress(row);
  }

  /** Validate, persist metadata, and push bytes to object storage for one file. */
  private async processOneFile(
    userId: string,
    file: Express.Multer.File,
    index: number,
  ): Promise<UploadItemResponse> {
    const validation = this.validateFile(file, index);
    if (!validation.ok) {
      return {
        fileName: file.originalname,
        fileSizeBytes: file.size,
        status: 'failed',
        percentComplete: 0,
        errorMessage: validation.errorMessage,
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
        status: 'uploading',
        percent_complete: 0,
        storage_path: storagePath,
      });

      await this.objectStorage.putObject({
        storagePath,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });
      objectWritten = true;

      row.status = 'stored';
      row.percent_complete = 100;
      const saved = await this.uploadedDocumentAction.saveDocument(row);
      return this.mapRowToUploadItem(saved);
    } catch (error) {
      this.logger.warn(
        `Upload failed for file index=${index} name=${file.originalname}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.rollbackSingleUpload(storagePath, row, objectWritten);
      return {
        fileName: file.originalname,
        fileType,
        fileSizeBytes: file.size,
        status: 'failed',
        percentComplete: 0,
        errorMessage: SYS_MSG.UPLOAD_FAILED,
      };
    }
  }

  private buildStoragePath(
    userId: string,
    uploadId: string,
    fileType: UploadFileType,
  ): string {
    return path.posix.join('funnels', userId, `${uploadId}.${fileType}`);
  }

  private validateFile(
    file: Express.Multer.File,
    _index: number,
  ): FileValidationResult {
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, errorMessage: SYS_MSG.UPLOAD_FILE_TOO_LARGE };
    }

    const fileType = this.detectFileType(file);
    if (!fileType) {
      return { ok: false, errorMessage: SYS_MSG.UPLOAD_INVALID_FILE };
    }

    return { ok: true, fileType };
  }

  /** Extension, MIME, and magic-byte checks must agree before upload. */
  private detectFileType(file: Express.Multer.File): UploadFileType | null {
    const extension = path.extname(file.originalname).toLowerCase();
    const candidates = (
      Object.entries(ALLOWED_UPLOAD_RULES) as [
        UploadFileType,
        (typeof ALLOWED_UPLOAD_RULES)[UploadFileType],
      ][]
    ).filter(([, rule]) => rule.ext === extension);

    for (const [fileType, rule] of candidates) {
      if (!rule.mimes.includes(file.mimetype)) {
        continue;
      }
      if (this.bufferMatchesFileType(file.buffer, fileType)) {
        return fileType;
      }
    }

    return null;
  }

  private bufferMatchesFileType(
    buffer: Buffer,
    fileType: UploadFileType,
  ): boolean {
    if (buffer.length < 4) {
      return false;
    }

    if (fileType === 'pdf') {
      return buffer.subarray(0, 4).toString('utf8') === '%PDF';
    }

    if (fileType === 'docx' || fileType === 'pptx') {
      return (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
      );
    }

    if (fileType === 'doc' || fileType === 'ppt') {
      return (
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0
      );
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
      fileType: row.file_type as UploadFileType,
      fileSizeBytes: Number(row.file_size_bytes),
      status: row.status ?? 'failed',
      percentComplete: row.percent_complete ?? 0,
    };
  }

  private mapRowToProgress(row: UploadedDocument): UploadProgressResponse {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      fileType: row.file_type as UploadFileType,
      fileSizeBytes: Number(row.file_size_bytes),
      status: row.status ?? 'failed',
      percentComplete: row.percent_complete ?? 0,
      uploadedAt: row.created_at.toISOString(),
    };
  }
}
