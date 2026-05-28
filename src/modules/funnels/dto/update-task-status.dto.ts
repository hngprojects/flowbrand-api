import { IsEnum, IsNotEmpty } from 'class-validator';
import { STAGE_TASK_STATUS } from '../entities/stage-task.entity';
import type { StageTaskStatus } from '../entities/stage-task.entity';

export class UpdateTaskStatusDto {
  @IsEnum(STAGE_TASK_STATUS)
  @IsNotEmpty()
  status: StageTaskStatus;
}
