import { HttpStatus } from '@nestjs/common';

// --- Domain types ---

/** Allowed document extensions stored in `uploaded_documents.file_type`. */
export type UploadFileType = 'pdf' | 'doc' | 'docx' | 'ppt' | 'pptx';

/** Row lifecycle while bytes are sent to object storage. */
export type UploadDocumentStatus = 'uploading' | 'stored' | 'failed';

// --- API responses (camelCase) ---

/** Per-file outcome from POST /funnels/upload (success or rejected for that file only). */
export interface UploadItemResponse {
  /** Present when the file was stored; omitted when validation/storage failed early. */
  uploadId?: string;
  fileName: string;
  fileType?: UploadFileType;
  fileSizeBytes: number;
  status: UploadDocumentStatus;
  percentComplete: number;
  /** Set when `status` is `failed` for this file. */
  errorMessage?: string;
}

/** POST /funnels/upload response envelope. */
export interface UploadBatchResponse {
  statusCode: typeof HttpStatus.CREATED | typeof HttpStatus.UNPROCESSABLE_ENTITY;
  message: string;
  data: {
    /** Groups files from one request; not stored in the database. */
    batchId: string;
    uploads: UploadItemResponse[];
  };
}

/** GET /funnels/upload/progress/:uploadId payload. */
export interface UploadProgressResponse {
  uploadId: string;
  fileName: string;
  fileType: UploadFileType;
  fileSizeBytes: number;
  status: UploadDocumentStatus;
  percentComplete: number;
  uploadedAt: string;
}

// --- Object storage port (MinIO) ---

export interface StoragePutParams {
  /** Object key inside the bucket (persisted as `storage_path`). */
  storagePath: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
}

export interface ObjectStorage {
  putObject(params: StoragePutParams): Promise<void>;
  deleteObject(storagePath: string): Promise<void>;
}

/** Nest injection token for `ObjectStorage`. */
export const UPLOAD_OBJECT_STORAGE = Symbol('UPLOAD_OBJECT_STORAGE');
