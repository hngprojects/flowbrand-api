import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { getData } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import * as SYS_MSG from '../../../constants/system.messages';
import type { PptxZipLoader, UploadFileType } from '../upload.types';

PDFParse.setWorker(getData());

const MAX_PARSED_TEXT_CHARS = 2_000_000;
/** Minimum length for coarse OLE (.doc/.ppt) text to be treated as usable. */
const OLE_MIN_TEXT_LENGTH = 40;
/** Minimum ratio of letters for OLE extraction (filters GUID/style noise). */
const OLE_MIN_LETTER_RATIO = 0.4;

const pptxZipLoader = JSZip as unknown as PptxZipLoader;

@Injectable()
export class DocumentTextExtractorService {
  private readonly logger = new Logger(DocumentTextExtractorService.name);

  async extract(buffer: Buffer, fileType: UploadFileType): Promise<string> {
    let text: string;

    switch (fileType) {
      case 'pdf':
        text = await this.extractPdf(buffer);
        break;
      case 'docx':
        text = await this.extractDocx(buffer);
        break;
      case 'doc':
        text = this.extractDocLegacy(buffer);
        break;
      case 'pptx':
        text = await this.extractPptx(buffer);
        break;
      case 'ppt':
        text = this.extractPptLegacy(buffer);
        break;
      default:
        throw new UnprocessableEntityException({
          error: 'UnprocessableEntityException',
          message: SYS_MSG.FUNNEL_UPLOAD_UNSUPPORTED_FILE_TYPE,
        });
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      throw new UnprocessableEntityException({
        error: 'UnprocessableEntityException',
        message: SYS_MSG.FUNNEL_UPLOAD_NO_EXTRACTABLE_TEXT,
      });
    }

    if (normalized.length > MAX_PARSED_TEXT_CHARS) {
      return normalized.slice(0, MAX_PARSED_TEXT_CHARS);
    }

    return normalized;
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? '';
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages.length) {
      this.logger.debug(
        `mammoth messages for docx: ${result.messages.map((m) => m.message).join('; ')}`,
      );
    }
    return result.value ?? '';
  }

  /** PPTX is a ZIP of slide XML files; extract visible text from `<a:t>` nodes. */
  private async extractPptx(buffer: Buffer): Promise<string> {
    const zip = await pptxZipLoader.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!slidePaths.length) {
      throw new UnprocessableEntityException({
        error: 'UnprocessableEntityException',
        message: SYS_MSG.FUNNEL_UPLOAD_NO_SLIDES,
      });
    }

    const chunks: string[] = [];
    for (const path of slidePaths) {
      const entry = zip.files[path];
      if (!entry) {
        continue;
      }
      const xml = await entry.async('string');
      const slideText = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map((match) => match[1] ?? '')
        .join(' ')
        .trim();
      if (slideText) {
        chunks.push(slideText);
      }
    }

    return chunks.join('\n\n');
  }


  private extractDocLegacy(buffer: Buffer): string {
    return this.extractOleLegacy(buffer);
  }
  
  private extractPptLegacy(buffer: Buffer): string {
    return this.extractOleLegacy(buffer);
  }

  /**
   * Coarse OLE (.doc/.ppt) extraction — best-effort only; not a full parser.
   * Returns empty string when output looks like binary noise so callers mark failed.
   */
  private extractOleLegacy(buffer: Buffer): string {
    const raw = buffer.toString('latin1');
    const runs = [...raw.matchAll(/[\x20-\x7E]{4,}/g)].map((m) => m[0]);
    const filtered = runs.filter(
      (chunk) => !/^(Arial|Times|Calibri|Helvetica)/i.test(chunk),
    );
    const text = filtered.join(' ').trim();
    return this.oleTextLooksUsable(text) ? text : '';
  }

  private oleTextLooksUsable(text: string): boolean {
    if (text.length < OLE_MIN_TEXT_LENGTH) {
      return false;
    }
    const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
    return letters / text.length >= OLE_MIN_LETTER_RATIO;
  }
}
