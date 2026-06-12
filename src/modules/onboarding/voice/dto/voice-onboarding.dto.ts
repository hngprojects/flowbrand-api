import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CompleteVoiceSessionDto {
  @ApiProperty({
    description: 'The UUID of the voice session to complete',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsString()
  @IsUUID()
  voiceSessionId: string;
}

export class VoiceSessionResponseDto {
  @ApiProperty({
    description: 'The UUID of the created or updated voice session',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  voiceSessionId: string;

  @ApiProperty({
    description: 'The current status of the voice session',
    example: 'processing',
  })
  status: string;

  static from(sessionId: string): VoiceSessionResponseDto {
    const dto = new VoiceSessionResponseDto();
    dto.voiceSessionId = sessionId;
    dto.status = 'processing';
    return dto;
  }
}

export class VoiceSessionCompleteResponseDto {
  @ApiProperty({
    description: 'The generated UploadDocument ID representing the finalized transcription',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  uploadId: string;

  static from(uploadId: string): VoiceSessionCompleteResponseDto {
    const dto = new VoiceSessionCompleteResponseDto();
    dto.uploadId = uploadId;
    return dto;
  }
}

export class VoiceSessionStatusResponseDto {
  @ApiProperty({
    description: 'The number of audio chunks that have been uploaded for transcription',
    example: 3,
  })
  expectedCount: number;

  @ApiProperty({
    description: 'The number of audio chunks that have finished transcribing',
    example: 3,
  })
  completedCount: number;

  @ApiProperty({
    description: 'True if all uploaded chunks have finished transcribing, and there is at least 1 chunk',
    example: true,
  })
  isReady: boolean;

  static from(expectedCount: number, completedCount: number): VoiceSessionStatusResponseDto {
    const dto = new VoiceSessionStatusResponseDto();
    dto.expectedCount = expectedCount;
    dto.completedCount = completedCount;
    dto.isReady = expectedCount > 0 && expectedCount === completedCount;
    return dto;
  }
}