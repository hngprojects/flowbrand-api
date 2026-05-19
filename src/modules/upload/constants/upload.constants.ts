import type { UploadFileType } from '../upload.types';

/** Max size per file (5 MiB) — enforced by Multer and service validation. */
export const MAX_UPLOAD_BYTES = 5_242_880;

/** Maximum number of files accepted on POST /funnels/upload. */
export const MAX_FILES_PER_UPLOAD = 3;

/** Progress values returned by POST / progress polling. */
export const UPLOAD_PROGRESS = {
  START: 0,
  STORED: 45,
  PARSING: 50,
  READY: 100,
} as const;

export const ALLOWED_UPLOAD_RULES: Record<UploadFileType, { ext: string; mimes: readonly string[] }> = {
  pdf: { ext: '.pdf', mimes: ['application/pdf'] },
  doc: { ext: '.doc', mimes: ['application/msword'] },
  docx: {
    ext: '.docx',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  ppt: { ext: '.ppt', mimes: ['application/vnd.ms-powerpoint'] },
  pptx: {
    ext: '.pptx',
    mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
};

/** MinIO env keys (via `process.env` until `env.ts` is updated). */
export const UPLOAD_STORAGE_ENV = {
  endpoint: 'UPLOAD_STORAGE_ENDPOINT',
  accessKey: 'UPLOAD_STORAGE_ACCESS_KEY',
  secretKey: 'UPLOAD_STORAGE_SECRET_KEY',
  bucket: 'UPLOAD_STORAGE_BUCKET',
  region: 'UPLOAD_STORAGE_REGION',
} as const;

export const UPLOAD_STORAGE_DEFAULT_REGION = 'us-east-1';
