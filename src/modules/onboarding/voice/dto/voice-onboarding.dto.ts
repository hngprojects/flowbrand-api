import { IsString, IsUUID } from 'class-validator';

export class CompleteVoiceSessionDto {
  @IsString()
  @IsUUID()
  voice_session_id: string;
}

export class VoiceSessionResponseDto {
  voice_session_id: string;
  status: string;

  static from(sessionId: string): VoiceSessionResponseDto {
    const dto = new VoiceSessionResponseDto();
    dto.voice_session_id = sessionId;
    dto.status = 'processing';
    return dto;
  }
}

export class VoiceSessionCompleteResponseDto {
  upload_id: string;

  static from(uploadId: string): VoiceSessionCompleteResponseDto {
    const dto = new VoiceSessionCompleteResponseDto();
    dto.upload_id = uploadId;
    return dto;
  }
}