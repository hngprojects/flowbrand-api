import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { FunnelCreationPath } from '../enums/funnel-creation-path.enum';

export class CreateFunnelDto {
  @ApiProperty({
    enum: FunnelCreationPath,
    description: 'Source of the funnel generation request',
  })
  @IsEnum(FunnelCreationPath)
  @IsNotEmpty()
  source: FunnelCreationPath;

  @ApiProperty({
    format: 'uuid',
    description:
      'Client-generated UUID used to deduplicate retries on flaky networks. ' +
      'The same key always resolves to the same funnel.',
  })
  @IsUUID()
  @IsNotEmpty()
  idempotency_key: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Required when source = document_upload. UUIDs of uploaded_documents to ' +
      'feed into generation. All must belong to the authenticated user.',
  })
  @ValidateIf((dto: CreateFunnelDto) => dto.source === FunnelCreationPath.DOCUMENT_UPLOAD)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  @IsOptional()
  upload_ids?: string[];
}

export class FunnelIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  funnelId: string;
}
