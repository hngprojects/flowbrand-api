import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FunnelModelAction } from '../../funnels/actions/funnel.action';
import { UploadedDocumentModelAction } from '../../upload/actions/uploaded-document.action';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { FunnelFailedEvent, emitSafely } from '../../../common/events';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  private readonly FUNNEL_STUCK_MS = 8 * 60 * 1000; // 8 minutes
  private readonly UPLOAD_STUCK_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly funnelAction: FunnelModelAction,
    private readonly uploadAction: UploadedDocumentModelAction,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runSweeps() {
    const [funnels, uploads] = await Promise.allSettled([
      this.sweepStuckFunnels(),
      this.sweepStuckUploads(),
    ]);
    return {
      funnelsReaped: funnels.status === 'fulfilled' ? funnels.value : 0,
      uploadsReaped: uploads.status === 'fulfilled' ? uploads.value : 0,
    };
  }

  private async sweepStuckFunnels(): Promise<number> {
    try {
      const stuckFunnels = await this.funnelAction.findStuckFunnels(this.FUNNEL_STUCK_MS);
      if (stuckFunnels.length === 0) {
        return 0; 
      }
      this.logger.warn(`Reaper found ${stuckFunnels.length} stuck funnels. Marking as FAILED.`);
      
      const ids = stuckFunnels.map((f) => f.id);
      await this.funnelAction.markFunnelsFailed(ids);
      for (const funnel of stuckFunnels) {
        emitSafely(
          this.eventEmitter,
          this.logger,
          APP_EVENTS.FUNNEL_FAILED,
          new FunnelFailedEvent(funnel.user_id, funnel.id)
        );
      }
      return stuckFunnels.length;
    } catch (error) {
      this.logger.error('Funnel sweep failed', error instanceof Error ? error.stack : String(error));
      return 0;
    }
  }

   private async sweepStuckUploads(): Promise<number> {
    try {
      const stuckUploads = await this.uploadAction.findStuckUploads(this.UPLOAD_STUCK_MS);
      if (stuckUploads.length === 0) {
        return 0;
      }
      this.logger.warn(`Reaper found ${stuckUploads.length} stuck uploads. Marking as FAILED.`);
      const ids = stuckUploads.map((u) => u.id);
      await this.uploadAction.markUploadsFailed(ids, 'Processing timed out after 5 minutes (Reaper)');
      return stuckUploads.length;
    } catch (error) {
      this.logger.error('Upload sweep failed', error instanceof Error ? error.stack : String(error));
      return 0;
    }
  }
}