import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
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
    ApiOperation({
      summary: 'Initialise onboarding wizard session',
      description:
        'Requires Bearer accessToken from POST /auth/login or /auth/register. ' +
        'Returns 409 if onboarding is already complete. ' +
        'Returns 200 with an existing in-progress session when still valid. ' +
        'Returns 201 when a new session is created.',
    }),
    ApiCreatedResponse({
      description: 'New wizard session created.',
      schema: {
        example: {
          status_code: HttpStatus.CREATED,
          message: SYS_MSG.ONBOARDING_SESSION_STARTED,
          data: startResponseDataExample,
        },
      },
    }),
    ApiOkResponse({
      description: 'Existing in-progress session resumed (idempotent).',
      schema: {
        example: {
          status_code: HttpStatus.OK,
          message: SYS_MSG.ONBOARDING_SESSION_RESUMED,
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
          message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
          path: '/api/onboarding/start',
          timestamp: '2026-05-15T12:00:00.000Z',
        },
      },
    }),
  );
