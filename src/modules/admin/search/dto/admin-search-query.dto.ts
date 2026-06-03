import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminSearchQueryDto {
  @ApiProperty({
    description: 'Search query across users by full name or email (minimum 2 characters)',
    example: 'john',
    minLength: 2,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Search query must be at least 2 characters long' })
  q: string;
}