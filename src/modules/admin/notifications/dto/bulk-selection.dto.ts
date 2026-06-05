import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * Selection payload shared by bulk delete (FR-6) and mark-unread (FR-8):
 * either an explicit list of ids or { all: true }. The service rejects
 * payloads that provide neither; an empty ids array is a valid no-op (FR-8).
 */
export class BulkSelectionDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Notification ids to act on' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];

  @ApiPropertyOptional({ type: Boolean, description: 'When true, the action applies to every notification owned by the admin' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
