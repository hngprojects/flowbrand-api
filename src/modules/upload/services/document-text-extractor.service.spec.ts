import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../constants/system.messages';
import { DocumentTextExtractorService } from './document-text-extractor.service';

// Mock heavy dependencies
jest.mock('pdf-parse/worker', () => ({
  getData: jest.fn(() => ({})),
}));

jest.mock('pdf-parse', () => {
  const mockPdfParse = jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ text: 'extracted pdf text' }),
    destroy: jest.fn().mockResolvedValue(undefined),
  }));
  (mockPdfParse as any).setWorker = jest.fn();

  return {
    PDFParse: mockPdfParse,
  };
});

jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({
    value: 'extracted docx text',
    messages: [],
  }),
}));

jest.mock('jszip', () => {
  const mockEntry = {
    async: jest.fn().mockResolvedValue(
      '<a:t>Slide one text</a:t><a:t>More text</a:t>',
    ),
  };
  return {
    loadAsync: jest.fn().mockResolvedValue({
      files: {
        'ppt/slides/slide1.xml': mockEntry,
        'ppt/slides/slide2.xml': mockEntry,
      },
    }),
  };
});

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';

describe('DocumentTextExtractorService', () => {
  let service: DocumentTextExtractorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentTextExtractorService],
    }).compile();

    service = module.get<DocumentTextExtractorService>(
      DocumentTextExtractorService,
    );
  });

  describe('AC-01 — PDF extraction', () => {
    it('AC-01: extracts text from a valid PDF buffer', async () => {
      const buffer = Buffer.from('%PDF-1.4 test');
      const result = await service.extract(buffer, 'pdf');
      expect(result).toBe('extracted pdf text');
    });

    it('EC-01: throws 422 when PDF extraction returns empty text', async () => {
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({ text: '   ' }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      await expect(service.extract(Buffer.from('%PDF-'), 'pdf')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('AC-02 — DOCX extraction', () => {
    it('AC-02: extracts text from a valid DOCX buffer', async () => {
      const buffer = Buffer.from('docx content');
      const result = await service.extract(buffer, 'docx');
      expect(result).toBe('extracted docx text');
      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer });
    });

    it('EC-02: throws 422 when DOCX extraction returns empty text', async () => {
      (mammoth.extractRawText as jest.Mock).mockResolvedValueOnce({
        value: '',
        messages: [],
      });

      await expect(
        service.extract(Buffer.from('empty'), 'docx'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('AC-03 — PPTX extraction', () => {
    it('AC-03: extracts text from slide XML nodes', async () => {
      const result = await service.extract(Buffer.from('pptx'), 'pptx');
      expect(result).toContain('Slide one text');
      expect(result).toContain('More text');
    });

    it('EC-03: throws 422 when PPTX has no slides', async () => {
      (JSZip.loadAsync as jest.Mock).mockResolvedValueOnce({ files: {} });

      await expect(
        service.extract(Buffer.from('empty pptx'), 'pptx'),
      ).rejects.toThrow(SYS_MSG.FUNNEL_UPLOAD_NO_SLIDES);
    });
  });

  describe('AC-04 — DOC/PPT legacy extraction', () => {
    it('AC-04: extracts readable text from a DOC-like buffer', async () => {
      const text = 'This is a valid business document with enough readable text content here';
      const buffer = Buffer.from(text, 'latin1');
      const result = await service.extract(buffer, 'doc');
      expect(result.length).toBeGreaterThan(0);
    });

    it('EC-04: throws 422 when DOC buffer contains only binary noise', async () => {
      const binaryNoise = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
      await expect(service.extract(binaryNoise, 'doc')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('AC-05: extracts text from PPT legacy buffer', async () => {
      const text = 'This is a valid presentation slide with enough readable text content here';
      const buffer = Buffer.from(text, 'latin1');
      const result = await service.extract(buffer, 'ppt');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('AC-06 — size limit', () => {
    it('AC-06: truncates output to 2 million characters', async () => {
      const longText = 'a'.repeat(3_000_000);
      (mammoth.extractRawText as jest.Mock).mockResolvedValueOnce({
        value: longText,
        messages: [],
      });

      const result = await service.extract(Buffer.from('docx'), 'docx');
      expect(result.length).toBe(2_000_000);
    });
  });

  describe('AC-07 — normalization', () => {
    it('AC-07: collapses multiple whitespace into single spaces', async () => {
      (mammoth.extractRawText as jest.Mock).mockResolvedValueOnce({
        value: 'hello   world\n\ttabs  here',
        messages: [],
      });

      const result = await service.extract(Buffer.from('docx'), 'docx');
      expect(result).toBe('hello world tabs here');
    });
  });
});