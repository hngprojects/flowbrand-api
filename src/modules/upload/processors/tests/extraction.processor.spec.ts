import { Test, TestingModule } from '@nestjs/testing';
import { UploadedDocumentModelAction } from '../../actions/uploaded-document.action';
import { UPLOAD_PROGRESS } from '../../constants/upload.constants';
import { DocumentTextExtractorService } from '../../services/document-text-extractor.service';
import { UploadDocumentStatus, UPLOAD_OBJECT_STORAGE } from '../../upload.types';
import type { ObjectStorage } from '../../upload.types';
import { ExtractionProcessor } from '../extraction.processor';
import type { ExtractionJobPayload } from '../extraction.processor';
import type { Job } from 'bull';

jest.mock('pdf-parse/worker', () => ({
  getData: jest.fn(() => ({})),
}));

jest.mock('pdf-parse', () => {
  const mockPdfParse = jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ text: 'extracted pdf text' }),
    destroy: jest.fn().mockResolvedValue(undefined),
  }));
  Object.assign(mockPdfParse, { setWorker: jest.fn() });

  return {
    PDFParse: mockPdfParse,
  };
});

const UPLOAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STORAGE_PATH = `funnels/user-1/${UPLOAD_ID}.pdf`;

const mockDocumentAction = {
  get: jest.fn(),
  saveDocument: jest.fn(),
};

const mockExtractor = {
  extract: jest.fn(),
};

const mockObjectStorage: jest.Mocked<ObjectStorage> = {
  putObject: jest.fn(),
  getObject: jest.fn(),
  deleteObject: jest.fn(),
};

function makeRow(overrides = {}) {
  return {
    id: UPLOAD_ID,
    user_id: 'user-1',
    file_name: 'pitch.pdf',
    file_size_bytes: '1024',
    file_type: 'pdf',
    status: UploadDocumentStatus.PARSING,
    percent_complete: UPLOAD_PROGRESS.PARSING,
    storage_path: STORAGE_PATH,
    parsed_text: null,
    failure_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeJob(overrides: Partial<ExtractionJobPayload> = {}): Job<ExtractionJobPayload> {
  return {
    id: 'job-1',
    data: {
      uploadId: UPLOAD_ID,
      userId: 'user-1',
      fileType: 'pdf',
      storagePath: STORAGE_PATH,
      ...overrides,
    },
  } as unknown as Job<ExtractionJobPayload>;
}

describe('ExtractionProcessor', () => {
  let module: TestingModule;
  let processor: ExtractionProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDocumentAction.get.mockResolvedValue(makeRow());
    mockDocumentAction.saveDocument.mockImplementation((row) => Promise.resolve(row));
    mockObjectStorage.getObject.mockResolvedValue(Buffer.from('%PDF-1.4 content'));
    mockExtractor.extract.mockResolvedValue('extracted text from PDF');

    module = await Test.createTestingModule({
      providers: [
        ExtractionProcessor,
        { provide: UploadedDocumentModelAction, useValue: mockDocumentAction },
        { provide: DocumentTextExtractorService, useValue: mockExtractor },
        { provide: UPLOAD_OBJECT_STORAGE, useValue: mockObjectStorage },
      ],
    }).compile();

    processor = module.get<ExtractionProcessor>(ExtractionProcessor);
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => {});
    jest.spyOn(processor['logger'], 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await module.close();
  });

  describe('AC-01 — success path', () => {
    it('AC-01: fetches from storage, extracts text, and saves READY status', async () => {
      await processor.handleExtraction(makeJob());

      expect(mockObjectStorage.getObject).toHaveBeenCalledWith(STORAGE_PATH);
      expect(mockExtractor.extract).toHaveBeenCalledWith(expect.any(Buffer), 'pdf');
      expect(mockDocumentAction.saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadDocumentStatus.READY,
          percent_complete: UPLOAD_PROGRESS.READY,
          parsed_text: 'extracted text from PDF',
          failure_reason: null,
        }),
      );
    });
  });

  describe('EC-01 — extraction failure does not crash the worker', () => {
    it('EC-01: marks record FAILED when getObject throws', async () => {
      mockObjectStorage.getObject.mockRejectedValue(new Error('MinIO unreachable'));

      await expect(processor.handleExtraction(makeJob())).resolves.toBeUndefined();

      expect(mockDocumentAction.saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadDocumentStatus.FAILED,
          percent_complete: 0,
          failure_reason: expect.stringContaining('MinIO unreachable'),
        }),
      );
    });

    it('EC-02: marks record FAILED when text extraction throws', async () => {
      mockExtractor.extract.mockRejectedValue(new Error('Corrupted PDF'));

      await expect(processor.handleExtraction(makeJob())).resolves.toBeUndefined();

      expect(mockDocumentAction.saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadDocumentStatus.FAILED,
          failure_reason: expect.stringContaining('Corrupted PDF'),
        }),
      );
    });

    it('EC-03: truncates failure_reason to 200 chars', async () => {
      mockExtractor.extract.mockRejectedValue(new Error('x'.repeat(300)));

      await processor.handleExtraction(makeJob());

      const saved = mockDocumentAction.saveDocument.mock.calls[0][0];
      expect(saved.failure_reason.length).toBeLessThanOrEqual(200);
    });
  });

  describe('EC-04 — record not found', () => {
    it('EC-04: skips extraction when upload record is missing', async () => {
      mockDocumentAction.get.mockResolvedValue(null);

      await expect(processor.handleExtraction(makeJob())).rejects.toThrow(`Upload record not found: ${UPLOAD_ID}`);

      expect(mockDocumentAction.saveDocument).not.toHaveBeenCalled();
      expect(mockObjectStorage.getObject).not.toHaveBeenCalled();
      expect(mockExtractor.extract).not.toHaveBeenCalled();
    });
  });

  describe('onFailed — DB reconciliation', () => {
    function makeFailedJob(overrides: Partial<ExtractionJobPayload> = {}): Job<ExtractionJobPayload> {
      return { ...makeJob(overrides), attemptsMade: 3 } as unknown as Job<ExtractionJobPayload>;
    }

    it('marks upload FAILED when status is PARSING', async () => {
      mockDocumentAction.get.mockResolvedValue(makeRow({ status: UploadDocumentStatus.PARSING }));

      await processor.onFailed(makeFailedJob(), new Error('Worker killed'));

      expect(mockDocumentAction.saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadDocumentStatus.FAILED,
          percent_complete: 0,
          failure_reason: 'Worker killed',
        }),
      );
    });

    it('does not overwrite status when already READY', async () => {
      mockDocumentAction.get.mockResolvedValue(makeRow({ status: UploadDocumentStatus.READY }));

      await processor.onFailed(makeFailedJob(), new Error('Late failure'));

      expect(mockDocumentAction.saveDocument).not.toHaveBeenCalled();
    });

    it('swallows DB errors so the handler never throws', async () => {
      mockDocumentAction.get.mockRejectedValue(new Error('DB connection lost'));

      await expect(processor.onFailed(makeFailedJob(), new Error('original error'))).resolves.toBeUndefined();
    });

    it('handles null upload row without throwing', async () => {
      mockDocumentAction.get.mockResolvedValue(null);

      await expect(processor.onFailed(makeFailedJob(), new Error('some error'))).resolves.toBeUndefined();

      expect(mockDocumentAction.saveDocument).not.toHaveBeenCalled();
    });
  });

  describe('idempotency guard — already terminal', () => {
    it('skips extraction and does not write to storage or DB when status is READY', async () => {
      mockDocumentAction.get.mockResolvedValue(makeRow({ status: UploadDocumentStatus.READY }));

      await expect(processor.handleExtraction(makeJob())).resolves.toBeUndefined();

      expect(mockObjectStorage.getObject).not.toHaveBeenCalled();
      expect(mockExtractor.extract).not.toHaveBeenCalled();
      expect(mockDocumentAction.saveDocument).not.toHaveBeenCalled();
    });

    it('skips extraction and does not write to storage or DB when status is FAILED', async () => {
      mockDocumentAction.get.mockResolvedValue(
        makeRow({ status: UploadDocumentStatus.FAILED, failure_reason: 'previous error' }),
      );

      await expect(processor.handleExtraction(makeJob())).resolves.toBeUndefined();

      expect(mockObjectStorage.getObject).not.toHaveBeenCalled();
      expect(mockExtractor.extract).not.toHaveBeenCalled();
      expect(mockDocumentAction.saveDocument).not.toHaveBeenCalled();
    });
  });
});
