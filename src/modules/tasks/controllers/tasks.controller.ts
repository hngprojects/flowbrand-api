import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import * as SYS_MSG from '../../../constants/system.messages';
import { TasksService } from '../services/tasks.service';
import { TriggerReaperDocs } from '../docs/tasks.swagger.doc';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('reaper/trigger')
  @HttpCode(HttpStatus.OK)
  @TriggerReaperDocs()
  async triggerReaper() {
    await this.tasksService.runSweeps();
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.REAPER_TRIGGERED_SUCCESSFULLY,
    };
  }
}