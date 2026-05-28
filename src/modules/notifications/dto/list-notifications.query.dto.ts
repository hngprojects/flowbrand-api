import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min, Max } from 'class-validator';
import { NotificationFilter } from '../enums/notification-filter.enum';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NotificationFilter, default: NotificationFilter.ALL })
  @IsOptional()
  @IsEnum(NotificationFilter)
  filter?: NotificationFilter = NotificationFilter.ALL;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  per_page?: number = 20;
}