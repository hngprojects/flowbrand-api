import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class SubmitStageFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @Transform(({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value))
  comment: string;
}