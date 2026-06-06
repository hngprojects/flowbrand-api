import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AdminNotificationType } from '../enums/admin-notification.enum';

export class ReadAllQueryDto {
  @ApiPropertyOptional({ enum: AdminNotificationType, description: 'When provided, only this type is marked as read' })
  @IsOptional()
  @IsEnum(AdminNotificationType)
  type?: AdminNotificationType;
}
