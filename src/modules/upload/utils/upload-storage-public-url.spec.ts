import { env } from '../../../config/env';
import { resolveUploadStoragePublicBaseUrl } from './upload-storage-public-url';

describe('resolveUploadStoragePublicBaseUrl', () => {
  const original = {
    publicEndpoint: env.UPLOAD_STORAGE_PUBLIC_ENDPOINT,
    bucket: env.UPLOAD_STORAGE_BUCKET,
  };

  afterEach(() => {
    env.UPLOAD_STORAGE_PUBLIC_ENDPOINT = original.publicEndpoint;
    env.UPLOAD_STORAGE_BUCKET = original.bucket;
  });

  it('returns publicHost/bucket when both are set', () => {
    env.UPLOAD_STORAGE_PUBLIC_ENDPOINT = 'https://staging.flowbrand.hng14.com';
    env.UPLOAD_STORAGE_BUCKET = 'flowbrand-uploads';

    expect(resolveUploadStoragePublicBaseUrl()).toBe(
      'https://staging.flowbrand.hng14.com/flowbrand-uploads',
    );
  });

  it('strips trailing slash from public endpoint', () => {
    env.UPLOAD_STORAGE_PUBLIC_ENDPOINT = 'https://staging.flowbrand.hng14.com/';
    env.UPLOAD_STORAGE_BUCKET = 'flowbrand-staging-uploads';

    expect(resolveUploadStoragePublicBaseUrl()).toBe(
      'https://staging.flowbrand.hng14.com/flowbrand-staging-uploads',
    );
  });

  it('returns null when public endpoint is empty (presigned fallback)', () => {
    env.UPLOAD_STORAGE_PUBLIC_ENDPOINT = '';
    env.UPLOAD_STORAGE_BUCKET = 'flowbrand-uploads';

    expect(resolveUploadStoragePublicBaseUrl()).toBeNull();
  });

  it('returns null when bucket is empty', () => {
    env.UPLOAD_STORAGE_PUBLIC_ENDPOINT = 'https://staging.flowbrand.hng14.com';
    env.UPLOAD_STORAGE_BUCKET = '';

    expect(resolveUploadStoragePublicBaseUrl()).toBeNull();
  });
});
