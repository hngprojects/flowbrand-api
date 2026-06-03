import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
 
export class CreateTeamDto {
  @ApiProperty({ description: 'Team name', example: 'Marketing' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
 
  @ApiProperty({ description: 'Team description', required: false, example: 'Responsible for all marketing activities' })
  @IsOptional()
  @IsString()
  description?: string;
}