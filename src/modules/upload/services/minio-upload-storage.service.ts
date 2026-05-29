import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as Minio from 'minio';
import { env } from '../../../config/env';
import {
  UPLOAD_STORAGE_DEFAULT_REGION,
} from '../constants/upload.constants';
import type {
  MinioClientConfig,
  ObjectStorage,
  StorageEndpointConfig,
  StoragePutParams,
} from '../upload.types';

function parseStorageEndpoint(endpoint: string): StorageEndpointConfig {
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
      const detail = error instanceof Error ? error.message : String(error);

      if (env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          `Upload object storage is unavailable: ${detail}`,
        );
      }

      this.logger.warn(
        'Upload storage bucket check failed — uploads will fail until MinIO is running and env is set',
        detail,
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

 async getObject(storagePath: string): Promise<Buffer> {
  const { client, bucket } = this.resolveClient();
  const stream = await client.getObject(bucket, storagePath);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

  async deleteObject(storagePath: string): Promise<void> {
    const { client, bucket } = this.resolveClient();
    await client.removeObject(bucket, storagePath);
  }

  async createPresignedGetObjectUrl(storagePath: string, expirySeconds: number): Promise<string> {
    const { client, bucket } = this.resolveClient();
    return client.presignedGetObject(bucket, storagePath, expirySeconds);
  }

  private resolveClient(): MinioClientConfig {
    if (this.config) {
      return this.config;
    }

    const endpoint = env.UPLOAD_STORAGE_ENDPOINT;
    const accessKey = env.UPLOAD_STORAGE_ACCESS_KEY;
    const secretKey = env.UPLOAD_STORAGE_SECRET_KEY;
    const bucket = env.UPLOAD_STORAGE_BUCKET;
    const region = env.UPLOAD_STORAGE_REGION || UPLOAD_STORAGE_DEFAULT_REGION;

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      const missing = [
        !endpoint && 'UPLOAD_STORAGE_ENDPOINT',
        !accessKey && 'UPLOAD_STORAGE_ACCESS_KEY',
        !secretKey && 'UPLOAD_STORAGE_SECRET_KEY',
        !bucket && 'UPLOAD_STORAGE_BUCKET',
      ].filter(Boolean);

      throw new InternalServerErrorException(
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
