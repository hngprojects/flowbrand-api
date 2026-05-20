import { HttpStatus, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import * as fs from 'node:fs';
import { QUEUES } from '../../common/constants/queue.constants';
import * as SYS_MSG from '../../constants/system.messages';

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
import { MAX_UPLOAD_BYTES, UPLOAD_PROGRESS } from './constants/upload.constants';
import { UploadedDocument } from './entities/uploaded-document.entity';
import { UploadedDocumentModelAction } from './actions/uploaded-document.action';
import { DocumentTextExtractorService } from './services/document-text-extractor.service';
import { UploadService } from './upload.service';
import { UPLOAD_OBJECT_STORAGE, UploadDocumentStatus, type ObjectStorage } from './upload.types';

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
};

function buildRow(overrides: Partial<UploadedDocument> = {}): UploadedDocument {
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

function mockPdfFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
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
    mockUploadedDocumentAction.saveDocument.mockImplementation((row) => Promise.resolve(row));
    mockUploadedDocumentAction.updateProgress.mockResolvedValue(undefined);
    mockObjectStorage.putObject.mockResolvedValue(undefined);
    mockObjectStorage.deleteObject.mockResolvedValue(undefined);
    mockObjectStorage.getObject.mockResolvedValue(Buffer.from('%PDF-1.4 test content'));
    mockDocumentTextExtractor.extract.mockResolvedValue('extracted funnel text');

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    // Default: disk size matches valid PDF buffer (EC-04 passes for normal files)
    (fs.statSync as jest.Mock).mockReturnValue({ size: Buffer.from('%PDF-1.4 test content').length });
    (fs.unlink as unknown as jest.Mock).mockImplementation((_path, cb) => (cb as (e: null) => void)(null));
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
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  describe('handleUpload', () => {
    it('throws UnprocessableEntityException when no files are provided', async () => {
      await expect(service.handleUpload(USER_ID, undefined)).rejects.toThrow(UnprocessableEntityException);
      await expect(service.handleUpload(USER_ID, [])).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when every file is rejected', async () => {
      const oversized = mockPdfFile({ size: MAX_UPLOAD_BYTES + 1 });
      (fs.statSync as jest.Mock).mockReturnValue({ size: MAX_UPLOAD_BYTES + 1 });

      await expect(service.handleUpload(USER_ID, [oversized])).rejects.toThrow(UnprocessableEntityException);
    });

    it('returns partial message when some files fail validation', async () => {
      const valid = mockPdfFile();
      const invalid = mockPdfFile({
        originalname: 'bad.exe',
        mimetype: 'application/octet-stream',
        filename: 'bad.exe',
        path: '/tmp/bad.exe',
      });

      const result = await service.handleUpload(USER_ID, [valid, invalid]);

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_PARTIAL);
      expect(result.data.uploads).toHaveLength(2);
      expect(result.data.uploads[0].uploadId).toBeDefined();
      expect(result.data.uploads[0].status).toBe(UploadDocumentStatus.UPLOADING);
      expect(result.data.uploads[1].status).toBe(UploadDocumentStatus.FAILED);
      expect(result.data.uploads[1].errorMessage).toBe(SYS_MSG.UPLOAD_INVALID_FILE);
    });

    it('accepts a valid file, stores in MinIO, and returns parsing status', async () => {
      const file = mockPdfFile();

      const result = await service.handleUpload(USER_ID, [file]);

      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_COMPLETED);
      expect(mockObjectStorage.putObject).toHaveBeenCalled();
      expect(mockExtractionQueue.add).toHaveBeenCalled();
      expect(result.data.uploads[0]).toMatchObject({
        fileName: 'pitch-deck.pdf',
        fileType: 'pdf',
        status: UploadDocumentStatus.UPLOADING,
        percentComplete: UPLOAD_PROGRESS.PARSING,
      });
    });

    it('rolls back DB row and object when MinIO putObject fails', async () => {
      mockObjectStorage.putObject.mockRejectedValue(new Error('storage down'));

      await expect(service.handleUpload(USER_ID, [mockPdfFile()])).rejects.toThrow(UnprocessableEntityException);

      expect(mockObjectStorage.deleteObject).not.toHaveBeenCalled();
      expect(mockUploadedDocumentAction.deleteById).toHaveBeenCalledTimes(1);
      expect(mockUploadedDocumentAction.createDocument).toHaveBeenCalled();
    });

    it('FR-10: succeeds when updateProgress fails twice then recovers on third attempt', async () => {
      mockUploadedDocumentAction.updateProgress
        .mockRejectedValueOnce(new Error('DB hiccup'))
        .mockRejectedValueOnce(new Error('DB hiccup'))
        .mockResolvedValue(undefined);

      const result = await service.handleUpload(USER_ID, [mockPdfFile()]);

      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_COMPLETED);
      expect(mockUploadedDocumentAction.updateProgress).toHaveBeenCalledTimes(3);
      expect(result.data.uploads[0].status).toBe(UploadDocumentStatus.UPLOADING);
    });

    it('FR-10: logs orphan_upload and throws when all retries are exhausted', async () => {
      mockUploadedDocumentAction.updateProgress.mockRejectedValue(new Error('DB down'));
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

      await expect(service.handleUpload(USER_ID, [mockPdfFile()])).rejects.toThrow(UnprocessableEntityException);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'orphan_upload' }));
      expect(mockUploadedDocumentAction.deleteById).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProgress', () => {
    it('throws NotFoundException when upload is not owned by user', async () => {
      mockUploadedDocumentAction.findOwnedById.mockResolvedValue(null);

      await expect(service.getProgress(USER_ID, UPLOAD_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns progress payload for an owned upload', async () => {
      mockUploadedDocumentAction.findOwnedById.mockResolvedValue(
        buildRow({
          status: UploadDocumentStatus.READY,
          percent_complete: UPLOAD_PROGRESS.READY,
        }),
      );

      const result = await service.getProgress(USER_ID, UPLOAD_ID);

      expect(mockUploadedDocumentAction.findOwnedById).toHaveBeenCalledWith(UPLOAD_ID, USER_ID);
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
