import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { STAGE_TASK_STATUS, type StageTaskStatus } from '../entities/stage-task.entity';

export class CompleteTaskDto {
  @ApiProperty({
    enum: STAGE_TASK_STATUS,
    example: 'complete',
    description: "Target task status. 'complete' marks it done; 'pending' reopens it.",
  })
  @IsIn(STAGE_TASK_STATUS)
  status: StageTaskStatus;
}
