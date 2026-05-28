import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { STAGE_TASK_STATUS } from '../entities/stage-task.entity';
import type { StageTaskStatus } from '../entities/stage-task.entity';

export class UpdateTaskStatusDto {
  @ApiProperty({
    description: 'Target status for the task. Toggles between pending and complete.',
    enum: STAGE_TASK_STATUS,
    example: 'complete',
  })
  @IsIn(STAGE_TASK_STATUS)
  status: StageTaskStatus;
}
