import { Module } from '@nestjs/common';
import { TasksService } from './services/tasks.service';
import { TasksController } from './controllers/tasks.controller';
import { FunnelsModule } from '../funnels/funnels.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [FunnelsModule, UploadModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}