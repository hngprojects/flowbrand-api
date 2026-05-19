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
  UPLOAD_PROGRESS,
} from './constants/upload.constants';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadDocumentStatus } from './upload.types';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
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
    private readonly documentTextExtractor: DocumentTextExtractorService,
    @Inject(UPLOAD_OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorage,
  ) {}

  async handleUpload( userId: string, files: Express.Multer.File[] | undefined): Promise<UploadBatchResponse> {
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

    const acceptedCount = uploads.filter((item) => item.uploadId).length;
    if (acceptedCount === 0) {
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
    const allAccepted = acceptedCount === uploads.length;
    return {
      statusCode: HttpStatus.CREATED,
      message: allAccepted
        ? SYS_MSG.FUNNEL_UPLOAD_COMPLETED
        : SYS_MSG.FUNNEL_UPLOAD_PARTIAL,
      data: { batchId, uploads },
    };
  }
  async getProgress(userId: string, uploadId: string):
   Promise<UploadProgressResponse> {
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
  private async processOneFile(userId: string, file: Express.Multer.File,index: number): Promise<UploadItemResponse> {
    const validation = this.validateFile(file);
    if (!validation.ok) {
      return {
        fileName: file.originalname,
        fileSizeBytes: file.size,
        status: UploadDocumentStatus.FAILED,
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
        status: UploadDocumentStatus.UPLOADING,
        percent_complete: UPLOAD_PROGRESS.START,
        storage_path: storagePath,
        parsed_text: null,
      });
      await this.objectStorage.putObject({
        storagePath,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });
      objectWritten = true;
      row.percent_complete = UPLOAD_PROGRESS.STORED;
      await this.uploadedDocumentAction.saveDocument(row);
      row.status = UploadDocumentStatus.PARSING;
      row.percent_complete = UPLOAD_PROGRESS.PARSING;
      const parsing = await this.uploadedDocumentAction.saveDocument(row);
      // Fire-and-forget: durable parsing (e.g. BullMQ) is a follow-up; process crash can leave parsing at 50%.
      void this.completeParsing(parsing, file.buffer, fileType, storagePath);
      return this.mapRowToUploadItem(parsing);
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
        status: UploadDocumentStatus.FAILED,
        percentComplete: 0,
        errorMessage: SYS_MSG.UPLOAD_FAILED,
      };
    }
  }
  private async completeParsing(
    row: UploadedDocument,
    buffer: Buffer,
    fileType: UploadFileType,
    storagePath: string,
  ): Promise<void> {
    try {
      const parsedText = await this.documentTextExtractor.extract(
        buffer,
        fileType,
      );
      row.parsed_text = parsedText;
      row.status = UploadDocumentStatus.READY;
      row.percent_complete = UPLOAD_PROGRESS.READY;
      await this.uploadedDocumentAction.saveDocument(row);
    } catch (error) {
      this.logger.warn(
        `Parse failed for uploadId=${row.id} name=${row.file_name}`,
        error instanceof Error ? error.message : error,
      );
      row.status = UploadDocumentStatus.FAILED;
      row.percent_complete = 0;
      row.parsed_text = null;
      await this.uploadedDocumentAction.saveDocument(row);
      try {
        await this.objectStorage.deleteObject(storagePath);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
  private buildStoragePath(userId: string, uploadId: string, fileType: UploadFileType): string {
    return path.posix.join('funnels', userId, `${uploadId}.${fileType}`);
  }
  private validateFile(file: Express.Multer.File): FileValidationResult {
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, errorMessage: SYS_MSG.UPLOAD_FILE_TOO_LARGE };
    }
    const fileType = this.detectFileType(file);
    if (!fileType) {
      return { ok: false, errorMessage: SYS_MSG.UPLOAD_INVALID_FILE };
    }
    return { ok: true, fileType };
  }

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
  private bufferMatchesFileType(buffer: Buffer, fileType: UploadFileType): boolean {
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
  private async rollbackSingleUpload(storagePath: string, row: UploadedDocument | null, objectWritten: boolean): Promise<void> {
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
      status: row.status,
      percentComplete: row.percent_complete,
    };
  }
  private mapRowToProgress(row: UploadedDocument): UploadProgressResponse {
    return {
      uploadId: row.id,
      fileName: row.file_name,
      fileType: row.file_type as UploadFileType,
      fileSizeBytes: Number(row.file_size_bytes),
      status: row.status,
      percentComplete: row.percent_complete,
      uploadedAt: row.created_at.toISOString(),
    };
  }
}