import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import {
  UPLOAD_STORAGE_DEFAULT_REGION,
  UPLOAD_STORAGE_ENV,
} from '../constants/upload.constants';
import type { ObjectStorage, StoragePutParams } from '../upload.types';

interface MinioClientConfig {
  client: Minio.Client;
  bucket: string;
  region: string;
}

function parseStorageEndpoint(endpoint: string): {
  endPoint: string;
  port: number;
  useSSL: boolean;
} {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port
    ? Number(url.port)
    : useSSL
      ? 443
      : 80;

  return {
    endPoint: url.hostname,
    port,
    useSSL,
  };
}

@Injectable()
export class MinioUploadStorageService implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(MinioUploadStorageService.name);
  private config: MinioClientConfig | null = null;
  private bucketReady = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucketExists();
    } catch (error) {
      this.logger.warn(
        'Upload storage bucket check failed — uploads will fail until MinIO is running and env is set',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async putObject(params: StoragePutParams): Promise<void> {
    const { client, bucket } = this.resolveClient();

    await client.putObject(
      bucket,
      params.storagePath,
      params.body,
      params.contentLength,
      { 'Content-Type': params.contentType },
    );
  }

  async deleteObject(storagePath: string): Promise<void> {
    const { client, bucket } = this.resolveClient();
    await client.removeObject(bucket, storagePath);
  }

  private resolveClient(): MinioClientConfig {
    if (this.config) {
      return this.config;
    }

    const endpoint = process.env[UPLOAD_STORAGE_ENV.endpoint];
    const accessKey = process.env[UPLOAD_STORAGE_ENV.accessKey];
    const secretKey = process.env[UPLOAD_STORAGE_ENV.secretKey];
    const bucket = process.env[UPLOAD_STORAGE_ENV.bucket];
    const region =
      process.env[UPLOAD_STORAGE_ENV.region] ?? UPLOAD_STORAGE_DEFAULT_REGION;

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      const missing = [
        !endpoint && UPLOAD_STORAGE_ENV.endpoint,
        !accessKey && UPLOAD_STORAGE_ENV.accessKey,
        !secretKey && UPLOAD_STORAGE_ENV.secretKey,
        !bucket && UPLOAD_STORAGE_ENV.bucket,
      ].filter(Boolean);

      throw new Error(
        `Upload object storage is not configured. Set: ${missing.join(', ')}`,
      );
    }

    const { endPoint, port, useSSL } = parseStorageEndpoint(endpoint);
    const client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    this.config = { client, bucket, region };
    this.logger.log(
      `Upload storage client ready (endpoint=${endpoint}, bucket=${bucket})`,
    );

    return this.config;
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.bucketReady) {
      return;
    }

    const { client, bucket, region } = this.resolveClient();
    const exists = await client.bucketExists(bucket);

    if (!exists) {
      await client.makeBucket(bucket, region);
      this.logger.log(`Created upload bucket: ${bucket}`);
    }

    this.bucketReady = true;
    this.logger.log(`Upload bucket ready: ${bucket}`);
  }
}
