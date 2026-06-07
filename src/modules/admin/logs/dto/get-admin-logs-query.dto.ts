import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { AdminLogActionType, AdminLogStatus } from '../enums/admin-log.enum';

export class GetAdminLogsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** No @Max: values above 50 are silently capped by the service, which flags meta.capped. */
  @ApiPropertyOptional({ default: 20, minimum: 1, description: 'Values above 50 are silently capped to 50' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  per_page?: number = 20;

  @ApiPropertyOptional({ enum: AdminLogActionType, example: AdminLogActionType.LOGIN })
  @IsOptional()
  @IsEnum(AdminLogActionType)
  action_type?: AdminLogActionType;

  @ApiPropertyOptional({ enum: AdminLogStatus, example: AdminLogStatus.SUCCESS })
  @IsOptional()
  @IsEnum(AdminLogStatus)
  status?: AdminLogStatus;

  @ApiPropertyOptional({ example: 'john', description: 'Partial match on user full_name or email' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @ApiPropertyOptional({ example: '2026-06-01', description: 'ISO date string, inclusive lower bound on created_at' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'ISO date string, inclusive upper bound on created_at' })
  @IsOptional()
  @IsDateString()
  date_to?: string;
}
