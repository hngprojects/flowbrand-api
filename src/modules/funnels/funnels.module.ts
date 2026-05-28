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
import { FunnelsController } from './controllers/funnels.controller';
import { FunnelModelAction } from './actions/funnel.action';
import { FunnelStageModelAction } from './actions/funnel-stage.action';
import { StageTaskModelAction } from './actions/stage-task.action';
import { FunnelsService } from './services/funnels.service';
import { StageFeedback } from './entities/stage-feedback.entity';
import { StageFeedbackModelAction } from './actions/stage-feedback.action';

@Module({
  imports: [
    TypeOrmModule.forFeature([Funnel, FunnelStage, StageTask, WizardSession, UploadedDocument, StageFeedback]),
    BullModule.registerQueue({ name: QUEUES.FUNNEL_GENERATION }),
    RedisModule,
  ],
  controllers: [FunnelsController],
  providers: [
    FunnelsService,
    FunnelModelAction,
    FunnelStageModelAction,
    StageTaskModelAction,
    StageFeedbackModelAction,
  ],
  exports: [
    FunnelsService,
    FunnelModelAction,
    FunnelStageModelAction,
    StageTaskModelAction,
  ],
})
export class FunnelsModule {}