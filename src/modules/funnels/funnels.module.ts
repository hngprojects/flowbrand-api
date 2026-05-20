import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from '../../common/constants/queue.constants';
import { WizardSession } from '../onboarding/entities/wizzard-session.entity';
import { RedisModule } from '../redis/redis.module';
import { UploadedDocument } from '../upload/entities/uploaded-document.entity';

import { Funnel } from './entities/funnel.entity';
import { FunnelStage } from './entities/funnel-stage.entity';
import { StageTask } from './entities/stage-task.entity';

import { FunnelsController } from './funnels.controller';

// Providers / actions
import { FunnelModelAction } from './actions/funnel.action';
import { FunnelStageModelAction } from './actions/funnel-stage.action';
import { FunnelRateLimitGuard } from './guards/funnel-rate-limit.guard';

// Two service implementations live in the module; import and alias both
import { FunnelsService as FunnelsReadService } from './funnels.service';
import { FunnelsService as FunnelsGenService } from './services/funnels.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Funnel, FunnelStage, StageTask, WizardSession, UploadedDocument]),
    BullModule.registerQueue({ name: QUEUES.FUNNEL_GENERATION }),
    RedisModule,
  ],
  controllers: [FunnelsController],
  providers: [
    FunnelsReadService,
    FunnelsGenService,
    FunnelModelAction,
    FunnelStageModelAction,
    FunnelRateLimitGuard,
  ],
  exports: [FunnelsGenService, FunnelModelAction],
})
export class FunnelsModule {}
