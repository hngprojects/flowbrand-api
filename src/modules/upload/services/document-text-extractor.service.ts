import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { UploadFileType } from '../upload.types';

const MAX_PARSED_TEXT_CHARS = 2_000_000;

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
        text = await this.extractDocx(buffer);
        break;
      case 'pptx':
        text = await this.extractPptx(buffer);
        break;
      case 'ppt':
        text = await this.extractPptLegacy(buffer);
        break;
      default:
        throw new Error(`Unsupported file type for parsing: ${fileType}`);
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      throw new Error('No extractable text found in document');
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
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!slidePaths.length) {
      throw new Error('No slides found in presentation');
    }

    const chunks: string[] = [];
    for (const path of slidePaths) {
      const xml = await zip.files[path].async('string');
      const slideText = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map((match) => match[1])
        .join(' ')
        .trim();
      if (slideText) {
        chunks.push(slideText);
      }
    }

    return chunks.join('\n\n');
  }

  /**
   * Legacy `.ppt` (OLE) has no reliable parser in-repo; use coarse text extraction.
   */
  private extractPptLegacy(buffer: Buffer): string {
    const raw = buffer.toString('latin1');
    const runs = [...raw.matchAll(/[\x20-\x7E]{4,}/g)].map((m) => m[0]);
    const filtered = runs.filter(
      (chunk) => !/^(Arial|Times|Calibri|Helvetica)/i.test(chunk),
    );
    return filtered.join(' ').trim();
  }
}
