import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitStageFeedbackDto {
  @ApiProperty({
    description: 'The feedback comment for the completed stage',
    example: 'This stage was incredibly helpful for my business!',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @Transform(({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value))
  comment: string;
}