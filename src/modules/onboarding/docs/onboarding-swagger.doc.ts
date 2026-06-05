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
  ApiBody,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

const startResponseDataExample = {
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  userId: '550e8400-e29b-41d4-a716-446655440002',
  status: 'in_progress' as const,
  stepsCompleted: 0,
  answers: {},
  expiresAt: '2026-05-16T12:00:00.000Z',
  createdAt: '2026-05-15T12:00:00.000Z',
  updatedAt: '2026-05-15T12:00:00.000Z',
};

const completedResponseDataExample = {
  status: 'complete' as const,
  redirect: { to: 'funnel_generation' },
};

export const StartOnboardingDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Initialise or retrieve onboarding wizard session',
      description:
        'Requires Bearer accessToken from POST /auth/login or /auth/register. ' +
        'If onboarding is already complete, returns 200 OK with redirect instructions. ' +
        'If an active in-progress session exists, returns 200 OK to resume it. ' +
        'If no active session exists, returns 201 Created.',
    }),
    ApiCreatedResponse({
      description: 'New wizard session created.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.ONBOARDING_SESSION_STARTED,
          data: startResponseDataExample,
        },
      },
    }),
    ApiOkResponse({
      description: 'Active session resumed OR user has already completed onboarding.',
      schema: {
        oneOf: [
          {
            description: 'Existing in-progress session resumed.',
            example: {
              success: true,
              statusCode: HttpStatus.OK,
              message: SYS_MSG.ONBOARDING_SESSION_RESUMED,
              data: startResponseDataExample,
            },
          },
          {
            description: 'Onboarding already completed previously.',
            example: {
              success: true,
              statusCode: HttpStatus.OK,
              message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
              data: completedResponseDataExample,
            },
          },
        ],
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token',
    }),
  );

export const PostStepDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Save a step answer in the onboarding wizard',
      description:
        'Saves the answer for a specific wizard step. ' +
        'Each step has a different answer schema — use the step examples dropdown. ' +
        'Step 3 requires `answer.discovery_channel` as a non-empty string array (not a single string). ' +
        'Calling the same step again overwrites the previous answer. ' +
        'Returns the full updated session.',
    }),
    ApiBody({
      description: 'The step answer payload. Select the step example from the dropdown to view the expected schema.',
      schema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid', description: 'The wizard session ID' },
          step: { type: 'integer', minimum: 1, maximum: 3, description: 'Step number' },
          answer: { type: 'object', description: 'Answer content' },
        },
        required: ['session_id', 'step', 'answer'],
      },
      examples: {
        step1: {
          summary: 'Step 1: Business Description',
          value: {
            session_id: '550e8400-e29b-41d4-a716-446655440001',
            step: 1,
            answer: {
              business_description:
                'We sell handmade skincare products including body butters, scrubs, and face creams made from natural African ingredients.',
            },
          },
        },
        step2: {
          summary: 'Step 2: Customer Profiling',
          value: {
            session_id: '550e8400-e29b-41d4-a716-446655440001',
            step: 2,
            answer: {
              customer_tags: {
                type: ['Women', 'Young adults'],
                location: ['Nigeria', 'Africa'],
                wants: ['Look good', 'Feel Confident'],
              },
              additional_notes: 'Mostly working-class women aged 22-35 who prefer natural products',
            },
          },
        },
        step3: {
          summary: 'Step 3: Discovery Channel (array — at least one)',
          description:
            'discovery_channel must be a non-empty array of enum values. ' +
            'Allowed: Instagram, Facebook, TikTok, Physical Location, Others. ' +
            'A single string (e.g. "TikTok") returns 422.',
          value: {
            session_id: '550e8400-e29b-41d4-a716-446655440001',
            step: 3,
            answer: {
              discovery_channel: ['TikTok'],
            },
          },
        },
      },
    }),
    ApiOkResponse({
      description: 'Step answer saved successfully.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ONBOARDING_STEP_SAVED,
          data: {
            sessionId: '550e8400-e29b-41d4-a716-446655440001',
            userId: '550e8400-e29b-41d4-a716-446655440002',
            status: 'in_progress',
            stepsCompleted: 1,
            answers: {
              step_1: { business_description: 'We sell handmade skincare products...' },
            },
            expiresAt: '2026-05-17T12:00:00.000Z',
            createdAt: '2026-05-16T12:00:00.000Z',
            updatedAt: '2026-05-16T12:00:00.000Z',
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
      description:
        'Answer validation failed (e.g. step 3 discovery_channel must be a non-empty array of allowed channels).',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: 'Validation failed',
          fields: {
            discovery_channel:
              'discovery_channel must be an array; each value must be one of: Instagram, Facebook, TikTok, Physical Location, Others',
          },
        },
      },
    }),
  );
