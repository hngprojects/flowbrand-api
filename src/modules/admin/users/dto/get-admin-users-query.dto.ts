import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SortDir, UserSortBy, UserStatusFilter } from '../enums/admin-users-query.enum';

export class GetAdminUsersQueryDto {
  @ApiPropertyOptional({ enum: UserStatusFilter, example: UserStatusFilter.ALL })
  @IsOptional()
  @IsEnum(UserStatusFilter)
  status?: UserStatusFilter;

  @ApiPropertyOptional({ example: 'john', description: 'Partial match on email or full_name (min 1 character)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  perPage?: number;

  @ApiPropertyOptional({ enum: UserSortBy, example: UserSortBy.CREATED_AT })
  @IsOptional()
  @IsEnum(UserSortBy)
  sortBy?: UserSortBy;

  @ApiPropertyOptional({ enum: SortDir, example: SortDir.DESC })
  @IsOptional()
  @IsEnum(SortDir)
  sortDir?: SortDir;
}
