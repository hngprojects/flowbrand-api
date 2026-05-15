import { InjectQueue } from '@nestjs/bull';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { QUEUES } from '../../common/constants/queue.constants';
import * as SYS_MSG from '../../constants/system.messages';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and readiness probe' })
  async check() {
    const [queueHealthy, dbHealthy] = await Promise.all([
      this.checkQueue(),
      this.checkDb(),
    ]);

    return {
      status: queueHealthy && dbHealthy ? SYS_MSG.HEALTH_OK : SYS_MSG.HEALTH_DEGRADED,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? SYS_MSG.HEALTH_SERVICE_UP : SYS_MSG.HEALTH_SERVICE_DOWN,
        queue: queueHealthy ? SYS_MSG.HEALTH_SERVICE_UP : SYS_MSG.HEALTH_SERVICE_DOWN,
      },
    };
  }

  private async checkQueue(): Promise<boolean> {
    try {
      await this.emailQueue.getJobCounts();
      return true;
    } catch {
      return false;
    }
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
