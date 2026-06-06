import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'node:fs';
import { QUEUES } from '../../common/constants/queue.constants';
import * as SYS_MSG from '../../constants/system.messages';
import { RedisService } from '../redis/redis.service';
import { MAX_UPLOAD_BYTES, UPLOAD_PROGRESS } from './constants/upload.constants';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
import { UploadService } from './upload.service';
import {
  UPLOAD_OBJECT_STORAGE,
  UploadDocumentStatus,
  type ObjectStorage,
} from './upload.types';
import { UploadFileConstraints } from './dto/upload-files.dto';

jest.mock('./services/document-text-extractor.service', () => ({
  DocumentTextExtractorService: class DocumentTextExtractorService {},
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
  unlink: jest.fn(),
  openSync: jest.fn(),
  readSync: jest.fn(),
  closeSync: jest.fn(),
  createReadStream: jest.fn(),
}));

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UPLOAD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockUploadedDocumentAction = {
  createDocument: jest.fn(),
  saveDocument: jest.fn(),
  findOwnedById: jest.fn(),
  deleteById: jest.fn(),
  updateProgress: jest.fn(),
};

const mockDocumentTextExtractor = {
  extract: jest.fn(),
};

const mockExtractionQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockObjectStorage: jest.Mocked<ObjectStorage> = {
  putObject: jest.fn(),
  getObject: jest.fn(),
  deleteObject: jest.fn(),
  createPresignedGetObjectUrl: jest.fn(),
};

const mockRedisService = { rateLimit: jest.fn() };

function buildRow(
  overrides: Partial<UploadedDocument> = {},
): UploadedDocument {
  return {
    id: UPLOAD_ID,
    user_id: USER_ID,
    file_name: 'pitch-deck.pdf',
    file_size_bytes: '9',
    file_type: 'pdf',
    status: UploadDocumentStatus.UPLOADING,
    percent_complete: UPLOAD_PROGRESS.START,
    storage_path: `funnels/${USER_ID}/${UPLOAD_ID}.pdf`,
    parsed_text: null,
    failure_reason: null,
    created_at: new Date('2026-05-16T12:00:00.000Z'),
    updated_at: new Date('2026-05-16T12:00:00.000Z'),
    user: undefined as never,
    ...overrides,
  };
}

function mockPdfFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  const buffer = Buffer.from('%PDF-1.4 test content');
  return {
    fieldname: 'files',
    originalname: 'pitch-deck.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
    stream: null as never,
    destination: '',
    filename: 'pitch-deck.pdf',
    path: '/tmp/pitch-deck.pdf',
    ...overrides,
  };
}

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockUploadedDocumentAction.createDocument.mockImplementation((partial) =>
      Promise.resolve(buildRow(partial as Partial<UploadedDocument>)),
    );
    mockUploadedDocumentAction.saveDocument.mockImplementation((row) =>
      Promise.resolve(row),
    );
    mockUploadedDocumentAction.updateProgress.mockResolvedValue(undefined);
    mockRedisService.rateLimit.mockResolvedValue({ exceeded: false, count: 1 });
    mockObjectStorage.putObject.mockResolvedValue(undefined);
    mockObjectStorage.deleteObject.mockResolvedValue(undefined);
    mockObjectStorage.getObject.mockResolvedValue(
      Buffer.from('%PDF-1.4 test content'),
    );
    mockDocumentTextExtractor.extract.mockResolvedValue(
      'extracted funnel text',
    );

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({
      size: Buffer.from('%PDF-1.4 test content').length,
    });
    (fs.unlink as unknown as jest.Mock).mockImplementation((_path, cb) =>
      (cb as (e: null) => void)(null),
    );
    (fs.openSync as jest.Mock).mockReturnValue(1);
    (fs.readSync as jest.Mock).mockImplementation((_fd, buffer) => {
      Buffer.from('%PDF-1.4').copy(buffer as Buffer);
      return 8;
    });
    (fs.closeSync as jest.Mock).mockReturnValue(undefined);
    (fs.createReadStream as jest.Mock).mockReturnValue({
      pipe: jest.fn(),
      on: jest.fn().mockReturnThis(),
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: UploadedDocumentModelAction,
          useValue: mockUploadedDocumentAction,
        },
        {
          provide: getQueueToken(QUEUES.DOCUMENT_EXTRACTION),
          useValue: mockExtractionQueue,
        },
        {
          provide: DocumentTextExtractorService,
          useValue: mockDocumentTextExtractor,
        },
        { provide: UPLOAD_OBJECT_STORAGE, useValue: mockObjectStorage },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  describe('handleUpload', () => {
    it('RL-01: throws 429 when per-user upload rate limit is exceeded', async () => {
      mockRedisService.rateLimit.mockResolvedValue({ exceeded: true, count: 21 });
      // Rate limit fires after file-presence check, so a non-empty array is required.
      const files = [mockPdfFile()];

      await expect(service.handleUpload(USER_ID, files)).rejects.toThrow(HttpException);
      await expect(service.handleUpload(USER_ID, files)).rejects.toMatchObject({
        message: SYS_MSG.UPLOAD_RATE_LIMIT_EXCEEDED,
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('AC-01: rejects when no files are provided', async () => {
      // Arrange
      const noFiles = undefined;

      // Act
      const call = service.handleUpload(USER_ID, noFiles as any);

      // Assert
      await expect(call).rejects.toThrow(UnprocessableEntityException);
      await expect(call).rejects.toMatchObject({
        response: { message: SYS_MSG.FUNNEL_UPLOAD_FILES_REQUIRED },
      });
    });

    it('AC-02: rejects when more than 3 files are provided', async () => {
      // Arrange
      const files = Array.from(
        { length: UploadFileConstraints.MAX_FILES + 1 },
        (_, index) =>
          mockPdfFile({
            originalname: `file-${index + 1}.pdf`,
            path: `/tmp/file-${index + 1}.pdf`,
          }),
      );

      // Act
      const call = service.handleUpload(USER_ID, files);

      // Assert
      await expect(call).rejects.toThrow(BadRequestException);
      await expect(call).rejects.toMatchObject({
        response: { message: SYS_MSG.UPLOAD_TOO_MANY_FILES },
      });
    });

    it('AC-03: rejects file-too-large uploads', async () => {
      // Arrange
      const oversized = mockPdfFile({ size: MAX_UPLOAD_BYTES + 1 });
      (fs.statSync as jest.Mock).mockReturnValue({ size: MAX_UPLOAD_BYTES + 1 });

      // Act
      const call = service.handleUpload(USER_ID, [oversized]);

      // Assert
      await expect(call).rejects.toThrow(UnprocessableEntityException);
      await expect(call).rejects.toMatchObject({
        response: { message: SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED },
      });
    });

    it('AC-04: rejects mime-type mismatches as invalid files', async () => {
      // Arrange
      const invalidMime = mockPdfFile({
        originalname: 'bad.pdf',
        mimetype: 'application/octet-stream',
        path: '/tmp/bad.pdf',
      });

      // Act
      const call = service.handleUpload(USER_ID, [invalidMime]);

      // Assert
      await expect(call).rejects.toThrow(UnprocessableEntityException);
      await expect(call).rejects.toMatchObject({
        response: { message: SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED },
      });
    });

    it('AC-05: returns partial when some files fail validation', async () => {
      // Arrange
      const valid = mockPdfFile();
      const invalid = mockPdfFile({
        originalname: 'bad.exe',
        mimetype: 'application/octet-stream',
        filename: 'bad.exe',
        path: '/tmp/bad.exe',
      });

      // Act
      const result = await service.handleUpload(USER_ID, [valid, invalid]);

      // Assert
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_PARTIAL);
      expect(result.uploads).toHaveLength(2);
      expect(result.uploads[0].uploadId).toBeDefined();
      expect(result.uploads[0].status).toBe(UploadDocumentStatus.UPLOADING);
      expect(result.uploads[1].status).toBe(UploadDocumentStatus.FAILED);
      expect(result.uploads[1].errorMessage).toBe(
        `File extension ".exe" is not allowed. Allowed: ${UploadFileConstraints.ALLOWED_EXTENSIONS.join(', ')}.`,
      );
    });

    it('AC-06: accepts a valid file, stores in MinIO, and queues extraction', async () => {
      // Arrange
      const file = mockPdfFile();

      // Act
      const result = await service.handleUpload(USER_ID, [file]);

      // Assert
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_COMPLETED);
      expect(mockObjectStorage.putObject).toHaveBeenCalled();
      expect(mockExtractionQueue.add).toHaveBeenCalled();
      expect(result.uploads[0]).toMatchObject({
        fileName: 'pitch-deck.pdf',
        fileType: 'pdf',
        status: UploadDocumentStatus.UPLOADING,
        percentComplete: UPLOAD_PROGRESS.PARSING,
      });
    });

    it('EC-01: rejects when MinIO putObject fails for the only file', async () => {
      // Arrange
      mockObjectStorage.putObject.mockRejectedValue(new Error('storage down'));

      // Act
      const call = service.handleUpload(USER_ID, [mockPdfFile()]);

      // Assert
      await expect(call).rejects.toThrow(UnprocessableEntityException);
      await expect(call).rejects.toMatchObject({
        response: { message: SYS_MSG.FUNNEL_UPLOAD_ALL_REJECTED },
      });
      expect(mockObjectStorage.deleteObject).not.toHaveBeenCalled();
      expect(mockUploadedDocumentAction.deleteById).toHaveBeenCalledTimes(1);
      expect(mockUploadedDocumentAction.createDocument).toHaveBeenCalled();
    });

    it('EC-02: returns partial when one file stored and another MinIO putObject fails', async () => {
      // Arrange
      mockObjectStorage.putObject
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('storage down'));
      const file1 = mockPdfFile({ originalname: 'a.pdf', path: '/tmp/a.pdf' });
      const file2 = mockPdfFile({ originalname: 'b.pdf', path: '/tmp/b.pdf' });

      // Act
      const result = await service.handleUpload(USER_ID, [file1, file2]);

      // Assert
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_PARTIAL);
      expect(result.uploads).toHaveLength(2);
      const statuses = result.uploads.map((u) => u.status);
      expect(statuses).toContain(UploadDocumentStatus.UPLOADING);
      expect(statuses).toContain(UploadDocumentStatus.FAILED);
      const failed = result.uploads.find(
        (u) => u.status === UploadDocumentStatus.FAILED,
      )!;
      expect(failed.errorMessage).toBe(SYS_MSG.UPLOAD_FAILED);
    });

    it('EC-03: detects multipart-truncated uploads and marks file as failed with UPLOAD_INTERRUPTED', async () => {
      // Arrange
      const good = mockPdfFile({ originalname: 'good.pdf', path: '/tmp/good.pdf' });
      const truncated = mockPdfFile({
        originalname: 'trunc.pdf',
        path: '/tmp/trunc.pdf',
        size: Buffer.from('%PDF-1.4 test content').length + 10,
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (p === '/tmp/trunc.pdf') {
          return { size: Buffer.from('%PDF-1.4 test content').length };
        }
        return { size: Buffer.from('%PDF-1.4 test content').length };
      });

      // Act
      const result = await service.handleUpload(USER_ID, [good, truncated]);

      // Assert
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_PARTIAL);
      expect(result.uploads).toHaveLength(2);
      const failed = result.uploads.find(
        (u) => u.status === UploadDocumentStatus.FAILED,
      )!;
      expect(failed.errorMessage).toBe(SYS_MSG.UPLOAD_INTERRUPTED);
    });

    it('EC-04: logs orphan_upload and throws when DB retries are exhausted', async () => {
      // Arrange
      mockUploadedDocumentAction.updateProgress.mockRejectedValue(
        new Error('DB down'),
      );
      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => {});

      // Act
      const call = service.handleUpload(USER_ID, [mockPdfFile()]);

      // Assert
      await expect(call).rejects.toThrow(UnprocessableEntityException);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'orphan_upload' }),
      );
      expect(mockUploadedDocumentAction.deleteById).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProgress', () => {
    it('EC-05: throws NotFoundException when upload is not owned by user', async () => {
      // Arrange
      mockUploadedDocumentAction.findOwnedById.mockResolvedValue(null);

      // Act
      const call = service.getProgress(USER_ID, UPLOAD_ID);

      // Assert
      await expect(call).rejects.toThrow(NotFoundException);
      await expect(call).rejects.toMatchObject({
        response: { message: SYS_MSG.FUNNEL_UPLOAD_NOT_FOUND },
      });
    });

    it('AC-07: returns progress payload for an owned upload', async () => {
      // Arrange
      mockUploadedDocumentAction.findOwnedById.mockResolvedValue(
        buildRow({
          status: UploadDocumentStatus.READY,
          percent_complete: UPLOAD_PROGRESS.READY,
        }),
      );

      // Act
      const result = await service.getProgress(USER_ID, UPLOAD_ID);

      // Assert
      expect(mockUploadedDocumentAction.findOwnedById).toHaveBeenCalledWith(
        UPLOAD_ID,
        USER_ID,
      );
      expect(result).toEqual({
        uploadId: UPLOAD_ID,
        fileName: 'pitch-deck.pdf',
        fileType: 'pdf',
        fileSizeBytes: 9,
        status: UploadDocumentStatus.READY,
        percentComplete: UPLOAD_PROGRESS.READY,
        uploadedAt: '2026-05-16T12:00:00.000Z',
        failureReason: null,
      });
    });
  });
});
