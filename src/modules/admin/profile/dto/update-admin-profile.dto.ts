import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAdminProfileDto {
  @ApiPropertyOptional({
    example: 'Jane Updated',
    description: 'Display name for the authenticated admin.',
  })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    description: 'Country associated with the authenticated admin.',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    example: 'admin@example.com',
    description: 'Read-only field; service rejects email updates with HTTP 422.',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
