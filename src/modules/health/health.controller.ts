import { InjectQueue } from '@nestjs/bull';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { QUEUES } from '../../common/constants/queue.constants';
import * as SYS_MSG from '../../constants/system.messages';
import { HealthCheckDocs } from './docs/health-swagger.doc';
import { HEALTH_RATE_LIMIT } from './health.constants';

@Controller('health')
export class HealthController {
  constructor(
    @InjectQueue(QUEUES.FUNNEL_GENERATION) private readonly funnelQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @HealthCheckDocs()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: HEALTH_RATE_LIMIT })
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [queueHealthy, dbHealthy] = await Promise.all([
      this.checkQueue(),
      this.checkDb(),
    ]);

    const healthy = queueHealthy && dbHealthy;
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? SYS_MSG.HEALTH_OK : SYS_MSG.HEALTH_DEGRADED,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? SYS_MSG.HEALTH_SERVICE_UP : SYS_MSG.HEALTH_SERVICE_DOWN,
        queue: queueHealthy ? SYS_MSG.HEALTH_SERVICE_UP : SYS_MSG.HEALTH_SERVICE_DOWN,
      },
    };
  }

  private async checkQueue(): Promise<boolean> {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000),
      );
      await Promise.race([this.funnelQueue.getJobCounts(), timeout]);
      return true;
    } catch {
      return false;
    }
  }

  private async checkDb(): Promise<boolean> {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000),
      );
      await Promise.race([this.dataSource.query('SELECT 1'), timeout]);
      return true;
    } catch {
      return false;
    }
  }
}
