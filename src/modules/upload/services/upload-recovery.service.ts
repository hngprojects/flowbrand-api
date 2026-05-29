import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UploadedDocumentModelAction } from '../actions/uploaded-document.action';

const STALE_PARSING_THRESHOLD_MS = 15 * 60 * 1000;

@Injectable()
export class UploadRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UploadRecoveryService.name);

  constructor(private readonly uploadedDocumentAction: UploadedDocumentModelAction) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const recovered = await this.uploadedDocumentAction.markStaleParsing(STALE_PARSING_THRESHOLD_MS);
      if (recovered > 0) {
        this.logger.warn(
          { event: 'stale_parsing_recovery', count: recovered },
          `Marked ${recovered} stale PARSING upload(s) as FAILED on startup`,
        );
      }
    } catch (err) {
      this.logger.error(
        {
          event: 'stale_parsing_recovery_error',
          error: err instanceof Error ? err.message : String(err),
        },
        'Failed to recover stale PARSING uploads on startup — uploads may remain stuck',
      );
    }
  }
}
