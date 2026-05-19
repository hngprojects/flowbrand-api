import { HttpStatus } from '@nestjs/common';
import type { Client } from 'minio';

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

// --- Service-internal types ---

export type FileValidationResult =
  | { ok: true; fileType: UploadFileType }
  | { ok: false; errorMessage: string };

/** JSZip slide entry used when parsing PPTX. */
export interface PptxZipFile {
  async(type: 'string'): Promise<string>;
}

/** Loaded PPTX archive (ZIP) handle. */
export interface PptxZip {
  files: Record<string, PptxZipFile>;
}

/** Resolved MinIO client settings (cached after first use). */
export interface MinioClientConfig {
  client: Client;
  bucket: string;
  region: string;
}

/** Parsed `UPLOAD_STORAGE_ENDPOINT` URL parts for the MinIO client. */
export interface StorageEndpointConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
}
