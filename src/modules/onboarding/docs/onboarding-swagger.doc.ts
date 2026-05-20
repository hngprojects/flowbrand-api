import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
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
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.ONBOARDING_SESSION_STARTED,
          data: startResponseDataExample,
        },
      },
    }),
    ApiOkResponse({
      description: 'Existing in-progress session resumed (idempotent).',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
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

export const GetSessionDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get active onboarding session',
      description:
        'Returns the most recent active onboarding session for the authenticated user. ' +
        'Only answered steps are included in the answers object — null steps are omitted. ' +
        'Returns 404 if no active session exists or if the session has expired.',
    }),
    ApiOkResponse({
      description: 'Active session returned successfully.',
      schema: {
        example: {
          success: true,
          data: {
            sessionId: '550e8400-e29b-41d4-a716-446655440001',
            status: 'in_progress',
            steps_completed: 2,
            answers: {
              step_1: { business_description: 'We sell handmade shoes' },
              step_2: { customer_tags: { type: ['retail'] } },
            },
            created_at: '2026-05-15T12:00:00.000Z',
            expires_at: '2026-05-16T12:00:00.000Z',
          },
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token.',
    }),
    ApiNotFoundResponse({
      description: 'No active session found or session has expired.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFoundException',
          message: SYS_MSG.ONBOARDING_SESSION_NOT_FOUND,
          path: '/api/onboarding/session',
          timestamp: '2026-05-15T12:00:00.000Z',
        },
      },
    }),
  );

export const PostStepDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Save a step answer in the onboarding wizard',
      description:
        'Saves the answer for a specific wizard step. ' +
        'Each step has a different answer schema. ' +
        'Calling the same step again overwrites the previous answer (idempotent). ' +
        'Returns the full updated session.',
    }),
    ApiOkResponse({
      description: 'Step answer saved successfully.',
      schema: {
        example: {
          success: true,
          data: {
            session_id: '550e8400-e29b-41d4-a716-446655440001',
            user_id: '550e8400-e29b-41d4-a716-446655440002',
            status: 'in_progress',
            steps_completed: 1,
            answers: {
              step_1: { business_description: 'We sell handmade shoes' },
            },
            expires_at: '2026-05-17T12:00:00.000Z',
            created_at: '2026-05-16T12:00:00.000Z',
            updated_at: '2026-05-16T12:00:00.000Z',
          },
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token.',
    }),
    ApiNotFoundResponse({
      description: 'Session not found or does not belong to this user.',
    }),
    ApiForbiddenResponse({
      description: 'Session has expired.',
    }),
    ApiConflictResponse({
      description: 'Onboarding already complete.',
    }),
    ApiUnprocessableEntityResponse({
      description: 'Answer validation failed.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: 'Validation failed',
          fields: {
            business_description: 'must be shorter than or equal to 500 characters',
          },
        },
      },
    }),
  );
