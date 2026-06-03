import { env } from '../../../config/env';

/**
 * Browser-readable base URL for stored objects: `{base}/{storagePath}`.
 * Built from UPLOAD_STORAGE_PUBLIC_ENDPOINT + UPLOAD_STORAGE_BUCKET (DevOps read URL).
 */
export function resolveUploadStoragePublicBaseUrl(): string | null {
  const publicHost = env.UPLOAD_STORAGE_PUBLIC_ENDPOINT.trim().replace(/\/$/, '');
  const bucket = env.UPLOAD_STORAGE_BUCKET.trim().replace(/^\/+|\/+$/g, '');

  if (!publicHost || !bucket) {
    return null;
  }

  return `${publicHost}/${bucket}`;
}
