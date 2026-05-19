import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

const FUNNEL_ID_EXAMPLE = '550e8400-e29b-41d4-a716-446655440001';

export const CreateFunnelDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Start funnel generation',
      description:
        'Creates a new funnel and dispatches the generation job to the Bull queue. ' +
        'Idempotent via `idempotency_key`: re-sending the same key returns 200 with ' +
        'the existing funnel_id rather than creating a duplicate. Rate-limited to ' +
        '5 requests per hour per user.',
    }),
    ApiAcceptedResponse({
      description: 'Generation accepted; client should poll the status endpoint.',
      schema: {
        example: {
          statusCode: HttpStatus.ACCEPTED,
          message: SYS_MSG.FUNNEL_GENERATION_STARTED,
          data: { funnel_id: FUNNEL_ID_EXAMPLE, status: 'generating' },
        },
      },
    }),
    ApiOkResponse({
      description: 'Idempotent re-submission; returns existing funnel.',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.FUNNEL_ALREADY_EXISTS,
          data: { funnel_id: FUNNEL_ID_EXAMPLE, status: 'generating' },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' }),
    ApiConflictResponse({
      description: 'Another funnel is already generating for this user.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          error: 'ConflictException',
          message: SYS_MSG.GENERATION_IN_PROGRESS,
        },
      },
    }),
    ApiUnprocessableEntityResponse({
      description:
        'Source validation failed: wizard session not complete, or upload(s) not ready / not owned.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.ONBOARDING_INCOMPLETE,
        },
      },
    }),
    ApiServiceUnavailableResponse({
      description: 'Queue dispatch failed (Redis down); funnel was rolled back.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'ServiceUnavailableException',
          message: SYS_MSG.GENERATION_SERVICE_UNAVAILABLE,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: 'Rate limit exceeded: 5 requests per hour per user.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'HttpException',
          message: SYS_MSG.GENERATION_RATE_LIMIT_EXCEEDED,
        },
      },
    }),
  );

export const GetFunnelStatusDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Poll funnel generation status',
      description:
        'Fast owner-scoped lookup. Returns 404 for cross-user funnels (does not ' +
        'reveal existence). While generating, response has no `redirect` field. ' +
        'On completion, includes `redirect: { to: "strategy_dashboard" }`. On ' +
        'failure, includes `error: { code, message, retry_endpoint }`.',
    }),
    ApiOkResponse({
      description: 'Funnel status snapshot.',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.FUNNEL_STATUS_RETRIEVED,
          data: {
            funnel_id: FUNNEL_ID_EXAMPLE,
            status: 'active',
            redirect: { to: 'strategy_dashboard' },
          },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' }),
    ApiNotFoundResponse({
      description: 'Funnel not found, or it belongs to a different user.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFoundException',
          message: SYS_MSG.FUNNEL_NOT_FOUND,
        },
      },
    }),
  );
