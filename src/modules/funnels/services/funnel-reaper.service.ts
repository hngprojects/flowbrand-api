import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Funnel } from '../entities/funnel.entity';
import { FunnelStatus } from '../enums/funnel-status.enum';
import { APP_EVENTS } from '../../../common/constants/app-events';
import { FunnelFailedEvent, emitSafely } from '../../../common/events';

@Injectable()
export class FunnelReaperService {
  private readonly logger = new Logger(FunnelReaperService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Runs at the 0th second of every minute
  @Cron(CronExpression.EVERY_MINUTE)
  async handleStuckFunnels() {
    try {
      const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000);

      // Find all funnels that are still generating
      const stuckFunnels = await this.manager.find(Funnel, {
        where: {
          status: FunnelStatus.GENERATING,
        },
      });

      // Filter for those older than 8 minutes
      const funnelsToFail = stuckFunnels.filter((f) => f.created_at < eightMinutesAgo);

      if (funnelsToFail.length === 0) {
        return; // Nothing to clean up
      }

      this.logger.warn({
        message: `Funnel Reaper found ${funnelsToFail.length} stuck funnels. Marking as FAILED.`,
        count: funnelsToFail.length,
      });

      for (const funnel of funnelsToFail) {
        // Mark as failed in DB
        await this.manager.update(Funnel, { id: funnel.id }, { status: FunnelStatus.FAILED });
        
        this.logger.warn({
           event: 'funnel_reaped',
           funnelId: funnel.id,
           userId: funnel.user_id,
        });

        // Emit the failure event so WebSockets/Emails are notified as if the worker failed normally
        emitSafely(
          this.eventEmitter, 
          this.logger, 
          APP_EVENTS.FUNNEL_FAILED, 
          new FunnelFailedEvent(funnel.user_id, funnel.id)
        );
      }
    } catch (error) {
      this.logger.error('Funnel reaper failed', error instanceof Error ? error.stack : String(error));
    }
  }
}