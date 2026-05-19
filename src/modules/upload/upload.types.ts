import { HttpStatus } from '@nestjs/common';

// --- Domain types ---

/** Allowed document extensions stored in `uploaded_documents.file_type`. */
export type UploadFileType = 'pdf' | 'doc' | 'docx' | 'ppt' | 'pptx';

/** Row lifecycle: storage then text extraction before ready. */
export enum UploadDocumentStatus {
  UPLOADING = 'uploading',
  PARSING = 'parsing',
  READY = 'ready',
  FAILED = 'failed',
}

// --- API responses (camelCase) ---
export interface UploadItemResponse {
 
  uploadId?: string;
  fileName: string;
  fileType?: UploadFileType;
  fileSizeBytes: number;
  status: UploadDocumentStatus;
  percentComplete: number;
  errorMessage?: string;
}

/** POST /funnels/upload response envelope. */
export interface UploadBatchResponse {
  statusCode: typeof HttpStatus.CREATED | typeof HttpStatus.UNPROCESSABLE_ENTITY;
  message: string;
  data: {
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
