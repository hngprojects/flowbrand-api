import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnprocessableEntityResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { CompleteVoiceSessionDto } from '../dto/voice-onboarding.dto';

const unauthorizedExample = {
  success: false,
  statusCode: HttpStatus.UNAUTHORIZED,
  error: 'UnauthorizedException',
  message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
};

export function UploadVoiceRoundDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Upload a voice round for onboarding',
      description:
        'Accepts a multipart/form-data request with an audio file and an optional voiceSessionId. ' +
        'If no voiceSessionId is provided, a new session is created. ' +
        'The audio is transcribed asynchronously and the text is accumulated ' +
        'under the session. Max file size is 10MB. Allowed formats include webm, mpeg, mp3, wav, ogg, mp4, m4a.',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'The audio file to upload and transcribe. Max size 10MB.',
          },
          voice_session_id: {
            type: 'string',
            format: 'uuid',
            description: 'Optional. Include to append to an existing session, omit for a new session.',
          },
        },
      },
    }),
    ApiOkResponse({
      description: 'Audio uploaded successfully. Returns the voice session ID.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.VOICE_UPLOAD_ACCEPTED,
          data: {
            voiceSessionId: '550e8400-e29b-41d4-a716-446655440001',
            status: 'processing',
          },
        },
      },
    }),
    ApiUnprocessableEntityResponse({
      description: 'File validation failed (invalid audio format or file too large).',
      schema: {
        examples: {
          fileTooLarge: {
            summary: 'File exceeds 10MB limit',
            value: {
              success: false,
              statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
              error: 'UnprocessableEntityException',
              message: SYS_MSG.VOICE_FILE_TOO_LARGE,
            },
          },
          invalidFormat: {
            summary: 'Unsupported audio format',
            value: {
              success: false,
              statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
              error: 'UnprocessableEntityException',
              message: SYS_MSG.VOICE_INVALID_AUDIO_FORMAT,
            },
          },
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'Session expired or invalid voiceSessionId.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFoundException',
          message: 'SESSION_EXPIRED',
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT token.',
      schema: { example: unauthorizedExample },
    }),
  );
}

export function CompleteVoiceSessionDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Complete voice onboarding session and generate document',
      description:
        'Finalizes a voice onboarding session by aggregating all transcriptions ' +
        'associated with the session ID. The aggregated text is then saved as a new ' +
        'UploadDocument record. Returns the resulting upload_id which can be passed ' +
        'to the funnel generation endpoints.',
    }),
    ApiBody({ type: CompleteVoiceSessionDto }),
    ApiOkResponse({
      description: 'Voice session completed successfully. Returns the generated UploadDocument ID.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.VOICE_SESSION_COMPLETED,
          data: {
            upload_id: '123e4567-e89b-12d3-a456-426614174000',
          },
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Validation failed or transcription is completely empty.',
      schema: {
        examples: {
          emptyTranscription: {
            summary: 'No transcription available',
            value: {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              error: 'BadRequestException',
              message: 'TRANSCRIPTION_EMPTY',
            },
          },
          validationFailed: {
            summary: 'Invalid session ID format',
            value: {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              error: 'BadRequestException',
              message: 'voiceSessionId must be a UUID',
            },
          },
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'Session expired, deleted, or does not exist.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFoundException',
          message: 'SESSION_EXPIRED',
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT token.',
      schema: { example: unauthorizedExample },
    }),
  );
}

export function GetVoiceSessionStatusDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Check transcription status of a voice session',
      description: 'Retrieves the number of uploaded chunks and the number of successfully transcribed chunks for a given voice session.',
    }),
    ApiOkResponse({
      description: 'Session status retrieved successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Status retrieved successfully',
          data: {
            expectedCount: 3,
            completedCount: 3,
            isReady: true,
          },
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'Session expired, deleted, or does not exist.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFoundException',
          message: 'SESSION_EXPIRED',
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT token.',
      schema: { example: unauthorizedExample },
    }),
  );
}