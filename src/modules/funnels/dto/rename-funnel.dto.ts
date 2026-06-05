import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameFunnelDto {
  @ApiProperty({
    example: 'Jollof Spot Lagos',
    minLength: 1,
    maxLength: 255,
    description: 'Display name for the funnel. Leading/trailing whitespace is trimmed automatically.',
  })
  @IsString()
  @Transform(({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(255)
  funnelName: string;
}
