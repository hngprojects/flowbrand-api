import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Funnel } from './entities/funnel.entity';
import { FunnelStage } from './entities/funnel-stage.entity';
import { StageTask } from './entities/stage-task.entity';
import { FunnelModelAction } from './actions/funnel.action';
import { FunnelStageModelAction } from './actions/funnel-stage.action';
import { StageTaskModelAction } from './actions/stage-task.action';
import { FunnelsService } from './funnels.service';
import { FunnelsController } from './funnels.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Funnel, FunnelStage, StageTask])],
  providers: [FunnelsService, FunnelModelAction, FunnelStageModelAction, StageTaskModelAction],
  controllers: [FunnelsController],
  exports: [FunnelsService, FunnelModelAction],
})
export class FunnelsModule {}
