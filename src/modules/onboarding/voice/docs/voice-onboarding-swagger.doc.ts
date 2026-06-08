import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { VoiceSessionCompleteResponseDto, VoiceSessionResponseDto } from '../dto/voice-onboarding.dto';

export function UploadVoiceRoundDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Upload a voice round for onboarding' }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
          },
          voice_session_id: {
            type: 'string',
            format: 'uuid',
            description: 'Include to append to an existing session, omit for a new session',
          },
        },
      },
    }),
    ApiOkResponse({
      description: SYS_MSG.VOICE_UPLOAD_ACCEPTED,
      type: VoiceSessionResponseDto,
    }),
  );
}

export function CompleteVoiceSessionDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Complete voice onboarding session and generate document' }),
    ApiOkResponse({
      description: SYS_MSG.VOICE_SESSION_COMPLETED,
      type: VoiceSessionCompleteResponseDto,
    }),
  );
}