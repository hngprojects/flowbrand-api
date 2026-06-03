import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminSearchQueryDto {
  @ApiProperty({
    description: 'Search query across users by full name or email (minimum 2 characters)',
    example: 'john',
    minLength: 2,
  })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2, { message: 'Search query must be at least 2 characters long' })
  q: string;
}