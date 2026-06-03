import { AvatarMimeType } from '../enums/avatar-mime-type.enum';
import { resolveUploadStoragePublicBaseUrl } from '../../upload/utils/upload-storage-public-url';

export const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024;
export const AVATAR_STORAGE_PREFIX = 'avatars';
export const AVATAR_SIGNED_URL_EXPIRY_SECONDS = 60 * 15;

export const ALLOWED_AVATAR_MIME_TYPES: readonly AvatarMimeType[] = [
  AvatarMimeType.JPEG,
  AvatarMimeType.PNG,
  AvatarMimeType.WEBP,
];

/** Builds a stable public object URL from UPLOAD_STORAGE_PUBLIC_ENDPOINT + bucket. */
export function buildPublicAvatarUrl(storagePath: string): string {
  const base = resolveUploadStoragePublicBaseUrl();
  if (!base) {
    throw new Error('Upload storage public base URL is not configured');
  }
  return `${base}/${storagePath}`;
}
