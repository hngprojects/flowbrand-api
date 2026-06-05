import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
 
export class CreateTeamDto {
  @ApiProperty({ description: 'Team name', example: 'Marketing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
 
  @ApiProperty({ description: 'Team description', required: false, example: 'Responsible for all marketing activities' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}