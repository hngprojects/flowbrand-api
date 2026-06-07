import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadDocumentStatus } from './upload.types';
import type { UploadBatchResponse, UploadProgressResponse } from './upload.types';
import * as SYS_MSG from '../../constants/system.messages';

const mockUploadService = {
  handleUpload: jest.fn(),
  getProgress: jest.fn(),
};

const MOCK_REQ = { ip: '127.0.0.1', headers: {} } as unknown as Request;

const batchResult: UploadBatchResponse = {
  message: SYS_MSG.FUNNEL_UPLOAD_COMPLETED,
  batchId: 'batch-1',
  uploads: [
    {
      uploadId: 'upload-1',
      fileName: 'pitch-deck.pdf',
      fileType: 'pdf',
      fileSizeBytes: 1024,
      status: UploadDocumentStatus.UPLOADING,
      percentComplete: 50,
    },
  ],
};

const progressResult: UploadProgressResponse = {
  uploadId: 'upload-1',
  fileName: 'pitch-deck.pdf',
  fileType: 'pdf',
  fileSizeBytes: 1024,
  status: UploadDocumentStatus.READY,
  percentComplete: 100,
  uploadedAt: '2026-05-26T07:09:17.277Z',
  failureReason: null,
};

describe('UploadController', () => {
  let module: TestingModule;
  let controller: UploadController;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [{ provide: UploadService, useValue: mockUploadService }],
    }).compile();
    controller = module.get<UploadController>(UploadController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('POST /funnels/upload', () => {
    it('returns a single-level envelope: data holds { batchId, uploads } with no nested envelope', async () => {
      mockUploadService.handleUpload.mockResolvedValue(batchResult);

      const result = await controller.upload('user-1', [] as Express.Multer.File[], MOCK_REQ);

      expect(mockUploadService.handleUpload).toHaveBeenCalledWith('user-1', [], MOCK_REQ);
      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.message).toBe(SYS_MSG.UPLOAD_BATCH_ACCEPTED);
      expect(result.data.batchId).toBe('batch-1');
      expect(Array.isArray(result.data.uploads)).toBe(true);
      expect(result.data.uploads[0].uploadId).toBe('upload-1');
      expect(result.data.uploads[0].percentComplete).toBe(50);

      // Regression guard: data must NOT carry a second embedded envelope.
      expect(result.data).not.toHaveProperty('success');
      expect(result.data).not.toHaveProperty('statusCode');
      expect(result.data).not.toHaveProperty('data');
    });
  });

  describe('GET /funnels/upload/progress/:uploadId', () => {
    it('returns a single-level envelope: data holds the progress fields with no nested envelope', async () => {
      mockUploadService.getProgress.mockResolvedValue(progressResult);

      const result = await controller.getProgress('user-1', 'upload-1');

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.message).toBe(SYS_MSG.FUNNEL_UPLOAD_PROGRESS_RETRIEVED);
      expect(result.data.uploadId).toBe('upload-1');
      expect(result.data.status).toBe(UploadDocumentStatus.READY);
      expect(result.data.percentComplete).toBe(100);

      // Regression guard: data must NOT carry a second embedded envelope.
      expect(result.data).not.toHaveProperty('success');
      expect(result.data).not.toHaveProperty('statusCode');
      expect(result.data).not.toHaveProperty('data');
    });
  });
});
