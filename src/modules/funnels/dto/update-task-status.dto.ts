import { IsEnum, IsNotEmpty } from 'class-validator';
import { STAGE_TASK_STATUS } from '../entities/stage-task.entity';
import type { StageTaskStatus } from '../entities/stage-task.entity';

export class UpdateTaskStatusDto {
  @IsEnum(STAGE_TASK_STATUS, { message: `status must be one of the following values: ${STAGE_TASK_STATUS.join(', ')}` })
  @IsNotEmpty()
  status: StageTaskStatus;
}
