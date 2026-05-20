import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../constants/system.messages';
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

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UPLOAD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockUploadedDocumentAction = {
  createDocument: jest.fn(),
  saveDocument: jest.fn(),
  findOwnedById: jest.fn(),
  deleteById: jest.fn(),
};

const mockDocumentTextExtractor = {
  extract: jest.fn(),
};

const mockObjectStorage: jest.Mocked<ObjectStorage> = {
  putObject: jest.fn(),
  deleteObject: jest.fn(),
};

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
    filename: '',
    path: '',
    ...overrides,
  };
}

/** Let void completeParsing() microtasks finish. */
async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
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
    mockObjectStorage.putObject.mockResolvedValue(undefined);
    mockObjectStorage.deleteObject.mockResolvedValue(undefined);
    mockDocumentTextExtractor.extract.mockResolvedValue('extracted funnel text');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: UploadedDocumentModelAction,
          useValue: mockUploadedDocumentAction,
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
    it('throws BadRequestException when no files are provided', async () => {
      await expect(service.handleUpload(USER_ID, undefined)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.handleUpload(USER_ID, [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnprocessableEntityException when every file is rejected', async () => {
      const oversized = mockPdfFile({
        size: MAX_UPLOAD_BYTES + 1,
      });

      await expect(
        service.handleUpload(USER_ID, [oversized]),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('returns partial message when some files fail validation', async () => {
      const valid = mockPdfFile();
      const invalid = mockPdfFile({
        originalname: 'bad.exe',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('not-a-real-doc'),
      });

      const result = await service.handleUpload(USER_ID, [valid, invalid]);

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_PARTIAL);
      expect(result.data.uploads).toHaveLength(2);
      expect(result.data.uploads[0].uploadId).toBeDefined();
      expect(result.data.uploads[0].status).toBe(UploadDocumentStatus.READY);
      expect(result.data.uploads[1].status).toBe(UploadDocumentStatus.FAILED);
      expect(result.data.uploads[1].errorMessage).toBe(
        SYS_MSG.UPLOAD_INVALID_FILE,
      );
    });

    it('accepts a valid file, stores in MinIO, and returns parsing status', async () => {
      const file = mockPdfFile();

      const result = await service.handleUpload(USER_ID, [file]);

      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_COMPLETED);
      expect(mockObjectStorage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          body: file.buffer,
          contentType: 'application/pdf',
        }),
      );
      expect(result.data.uploads[0]).toMatchObject({
        fileName: 'pitch-deck.pdf',
        fileType: 'pdf',
        status: UploadDocumentStatus.READY,
        percentComplete: UPLOAD_PROGRESS.READY,
      });
    });

    it('rolls back DB row and object when MinIO putObject fails', async () => {
      mockObjectStorage.putObject.mockRejectedValue(new Error('storage down'));

      await expect(
        service.handleUpload(USER_ID, [mockPdfFile()]),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockObjectStorage.deleteObject).not.toHaveBeenCalled();
      expect(mockUploadedDocumentAction.deleteById).toHaveBeenCalledTimes(1);
      expect(mockUploadedDocumentAction.createDocument).toHaveBeenCalled();
    });
  });

  describe('completeParsing (background)', () => {
    it('sets ready and parsed_text after successful extraction', async () => {
      await service.handleUpload(USER_ID, [mockPdfFile()]);
      await flushBackgroundWork();

      const lastSave = mockUploadedDocumentAction.saveDocument.mock.calls.at(-1)?.[0];
      expect(lastSave?.status).toBe(UploadDocumentStatus.READY);
      expect(lastSave?.percent_complete).toBe(UPLOAD_PROGRESS.READY);
      expect(lastSave?.parsed_text).toBe('extracted funnel text');
    });

    it('marks failed and deletes MinIO object when parsing fails', async () => {
      mockDocumentTextExtractor.extract.mockRejectedValue(
        new Error('parse failed'),
      );

      await service.handleUpload(USER_ID, [mockPdfFile()]);
      await flushBackgroundWork();

      const lastSave = mockUploadedDocumentAction.saveDocument.mock.calls.at(-1)?.[0];
      expect(lastSave?.status).toBe(UploadDocumentStatus.FAILED);
      expect(lastSave?.percent_complete).toBe(0);
      expect(lastSave?.parsed_text).toBeNull();
      expect(mockObjectStorage.deleteObject).toHaveBeenCalled();
    });
  });

  describe('getProgress', () => {
    it('throws NotFoundException when upload is not owned by user', async () => {
      mockUploadedDocumentAction.findOwnedById.mockResolvedValue(null);

      await expect(
        service.getProgress(USER_ID, UPLOAD_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns progress payload for an owned upload', async () => {
      mockUploadedDocumentAction.findOwnedById.mockResolvedValue(
        buildRow({
          status: UploadDocumentStatus.READY,
          percent_complete: UPLOAD_PROGRESS.READY,
        }),
      );

      const result = await service.getProgress(USER_ID, UPLOAD_ID);

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
      });
    });
  });
});
