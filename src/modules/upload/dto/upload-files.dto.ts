import { HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  MAX_FILES_PER_UPLOAD,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_RULES,
} from '../constants/upload.constants';
import {
  UploadDocumentStatus,
  type UploadBatchResponse,
  type UploadItemResponse,
  type UploadProgressResponse,
} from '../upload.types';
import * as SYS_MSG from '../../../constants/system.messages';

// ── Allowed MIME types (derived from the constants) ─────────────────────────
const ALLOWED_MIMES: readonly string[] = Object.values(ALLOWED_UPLOAD_RULES)
  .flatMap((rule) => [...rule.mimes]);

const ALLOWED_EXTENSIONS: readonly string[] = Object.values(ALLOWED_UPLOAD_RULES)
  .map((rule) => rule.ext);

/**
 * Validates a single Multer file.
 *
 * NOTE: Because Multer files are NOT JSON body fields, class-validator cannot
 * validate them automatically via the global ValidationPipe.
 * This class is used **manually** inside the service or a custom pipe.
 */
export class UploadFileConstraints {
  /** Maximum file size in bytes. */
  static readonly MAX_SIZE_BYTES = MAX_UPLOAD_BYTES;

  /** Maximum number of files per request. */
  static readonly MAX_FILES = MAX_FILES_PER_UPLOAD;

  /** Allowed MIME types. */
  static readonly ALLOWED_MIMES = ALLOWED_MIMES;

  /** Allowed file extensions (lowercase, with dot). */
  static readonly ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;

  /**
   * Run all constraint checks on a single file.
   * Returns `null` if valid, or a human-readable error string.
   */
  static validate(file: Express.Multer.File): string | null {
    if (!file.originalname || file.originalname.trim() === '') {
      return 'File name must not be empty.';
    }

    if (file.size === 0) {
      return 'Uploaded file is empty.';
    }

    if (file.size > UploadFileConstraints.MAX_SIZE_BYTES) {
      return `File exceeds the maximum allowed size of ${UploadFileConstraints.MAX_SIZE_BYTES} bytes.`;
    }

    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (!UploadFileConstraints.ALLOWED_EXTENSIONS.includes(ext)) {
      return `File extension "${ext}" is not allowed. Allowed: ${UploadFileConstraints.ALLOWED_EXTENSIONS.join(', ')}.`;
    }

    if (!UploadFileConstraints.ALLOWED_MIMES.includes(file.mimetype)) {
      return `MIME type "${file.mimetype}" is not allowed.`;
    }

    return null;
  }
}

/**
 * DTO wrapping the uploaded files array.
 *
 * Used for Swagger documentation and for manual validation in the controller/service.
 * Multer files do NOT flow through the global ValidationPipe, so these decorators
 * serve primarily as documentation. Actual enforcement happens via
 * `UploadFileConstraints.validate()` and the Multer interceptor config.
 */
export class UploadFilesDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    maxItems: MAX_FILES_PER_UPLOAD,
    minItems: 1,
    description:
      `Upload 1–${MAX_FILES_PER_UPLOAD} files. ` +
      `Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}. ` +
      `Max size per file: ${MAX_UPLOAD_BYTES} bytes (${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MiB).`,
  })
  files: Express.Multer.File[];
}

export class UploadBatchItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', required: false })
  uploadId?: string;

  @ApiProperty({ example: 'pitch-deck.pdf' })
  fileName!: string;

  @ApiProperty({ example: 'pdf', required: false })
  fileType?: string;

  @ApiProperty({ example: 102400 })
  fileSizeBytes!: number;

  @ApiProperty({ example: UploadDocumentStatus.UPLOADING })
  status!: UploadDocumentStatus;

  @ApiProperty({ example: 50 })
  percentComplete!: number;

  @ApiProperty({ example: 'Uploaded file is too large', required: false })
  errorMessage?: string;

  @ApiProperty({ required: false, example: { file: { extension: '.exe' } } })
  errorFields?: Record<string, unknown>;

  static from(item: UploadItemResponse): UploadBatchItemDto {
    return Object.assign(new UploadBatchItemDto(), item);
  }
}

export class UploadBatchDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440099' })
  batchId!: string;

  @ApiProperty({ type: () => [UploadBatchItemDto] })
  uploads!: UploadBatchItemDto[];

  static from(result: UploadBatchResponse): UploadBatchDataDto {
    const dto = new UploadBatchDataDto();
    dto.batchId = result.batchId;
    dto.uploads = result.uploads.map((item) => UploadBatchItemDto.from(item));
    return dto;
  }
}

export class UploadProgressDataDto {
  @ApiProperty({ example: 'bc288d2c-1d2d-4996-9d44-87c483f142f0' })
  uploadId!: string;

  @ApiProperty({ example: 'The_Innovators_Dilemma booktree.ng.pdf' })
  fileName!: string;

  @ApiProperty({ example: 'pdf' })
  fileType!: string;

  @ApiProperty({ example: 3123227 })
  fileSizeBytes!: number;

  @ApiProperty({ example: UploadDocumentStatus.READY })
  status!: UploadDocumentStatus;

  @ApiProperty({ example: 100 })
  percentComplete!: number;

  @ApiProperty({ example: '2026-05-24T13:48:19.605Z' })
  uploadedAt!: string;

  @ApiProperty({ example: null, nullable: true })
  failureReason!: string | null;

  static from(progress: UploadProgressResponse): UploadProgressDataDto {
    return Object.assign(new UploadProgressDataDto(), progress);
  }
}

export class UploadTooManyFilesResponseDto {
  @ApiProperty({ example: false })
  success = false;

  @ApiProperty({ example: HttpStatus.BAD_REQUEST })
  statusCode = HttpStatus.BAD_REQUEST;

  @ApiProperty({ example: 'Bad Request' })
  error = 'Bad Request';

  @ApiProperty({ example: SYS_MSG.UPLOAD_TOO_MANY_FILES })
  message = SYS_MSG.UPLOAD_TOO_MANY_FILES;

  @ApiProperty({ example: '/api/funnels/upload' })
  path = '/api/funnels/upload';

  @ApiProperty({ example: '2026-05-24T13:48:19.605Z' })
  timestamp = '2026-05-24T13:48:19.605Z';
}

export class UploadNotFoundResponseDto {
  @ApiProperty({ example: false })
  success = false;

  @ApiProperty({ example: HttpStatus.NOT_FOUND })
  statusCode = HttpStatus.NOT_FOUND;

  @ApiProperty({ example: 'NotFoundException' })
  error = 'NotFoundException';

  @ApiProperty({ example: SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND })
  message = SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND;

  @ApiProperty({ example: '/api/funnels/upload/progress/:uploadId' })
  path = '/api/funnels/upload/progress/:uploadId';

  @ApiProperty({ example: '2026-05-24T13:48:19.605Z' })
  timestamp = '2026-05-24T13:48:19.605Z';
}

export class UploadRejectedResponseDto {
  @ApiProperty({ example: false })
  success = false;

  @ApiProperty({ example: HttpStatus.UNPROCESSABLE_ENTITY })
  statusCode = HttpStatus.UNPROCESSABLE_ENTITY;

  @ApiProperty({ example: 'UnprocessableEntityException' })
  error = 'UnprocessableEntityException';

  @ApiProperty({ example: SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED })
  message = SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED;

  @ApiProperty({ example: '/api/funnels/upload' })
  path = '/api/funnels/upload';

  @ApiProperty({ example: '2026-05-24T13:48:19.605Z' })
  timestamp = '2026-05-24T13:48:19.605Z';

  @ApiProperty({
    example: [
      {
        index: 0,
        fileName: 'bad.exe',
        errorMessage: SYS_MSG.UPLOAD_INVALID_FILE,
        fields: { file: { extension: '.exe' } },
      },
    ],
    required: false,
  })
  details?: unknown;
}