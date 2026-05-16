import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

const startResponseDataExample = {
  session_id: '550e8400-e29b-41d4-a716-446655440001',
  user_id: '550e8400-e29b-41d4-a716-446655440002',
  status: 'in_progress' as const,
  steps_completed: 0,
  answers: {},
  expires_at: '2026-05-16T12:00:00.000Z',
  created_at: '2026-05-15T12:00:00.000Z',
  updated_at: '2026-05-15T12:00:00.000Z',
};

export const StartOnboardingDocs = () =>
  applyDecorators(
    HttpCode(HttpStatus.CREATED),
    ApiOperation({
      summary: 'Initialise onboarding wizard session',
      description:
        'Requires `Authorization: Bearer <accessToken>` from `POST /auth/login` or `/auth/register` (`data.accessToken`). Do not use the DB session id or refresh cookie. If the user already completed 
    }),
    ApiCreatedResponse({
      description:
        'Wizard session ready; `data.session_id` is the server-generated session identifier.',
      schema: {
        example: {
          status_code: HttpStatus.CREATED,
          message: SYS_MSG.ONBOARDING_API.SESSION_STARTED,
          data: startResponseDataExample,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token',
    }),
    ApiConflictResponse({
      description: 'User has already completed onboarding',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          error: 'ConflictException',
          message: SYS_MSG.ONBOARDING_API.ALREADY_COMPLETE,
          code: SYS_MSG.ONBOARDING_API.ALREADY_COMPLETE,
          path: '/api/onboarding/start',
          timestamp: '2026-05-15T12:00:00.000Z',
        },
      },
    }),
  );
