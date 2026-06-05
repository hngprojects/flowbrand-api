import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AdminNotificationReadFilter, AdminNotificationTypeFilter } from '../enums/admin-notification.enum';

export class ListAdminNotificationsQueryDto {
  @ApiPropertyOptional({ enum: AdminNotificationTypeFilter, default: AdminNotificationTypeFilter.ALL })
  @IsOptional()
  @IsEnum(AdminNotificationTypeFilter)
  type?: AdminNotificationTypeFilter = AdminNotificationTypeFilter.ALL;

  @ApiPropertyOptional({ enum: AdminNotificationReadFilter, default: AdminNotificationReadFilter.ALL })
  @IsOptional()
  @IsEnum(AdminNotificationReadFilter)
  read?: AdminNotificationReadFilter = AdminNotificationReadFilter.ALL;

  @ApiPropertyOptional({ type: Boolean, description: 'When true, only starred notifications are returned' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value as unknown;
  })
  @IsBoolean()
  starred?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  per_page?: number = 20;
}
