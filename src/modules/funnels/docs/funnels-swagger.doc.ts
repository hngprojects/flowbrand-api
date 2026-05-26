import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import {
  forbiddenStageLockedExample,
  funnelFullExample,
  funnelListExample,
  funnelStageDetailExample,
  funnelStagesSummaryExample,
  lockedStageExample,
  notFoundExample,
  stageCompletionExample,
  stagePendingTasksExample,
  unauthorizedExample,
} from '../funnels.swagger';

const FUNNEL_ID_EXAMPLE = '550e8400-e29b-41d4-a716-446655440001';

export const CreateFunnelDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Start funnel generation',
      description:
        'Creates a new funnel and dispatches the generation job to the Bull queue. ' +
        'The caller must generate a UUID v4 and pass it as `idempotency_key`. ' +
        'Re-sending the same key returns 200 with the existing funnel_id rather than ' +
        'creating a duplicate — use this to safely retry on network failures. ' +
        'Idempotency re-submissions do NOT count against the rate limit. ' +
        'Rate-limited to 5 new generation requests per hour per user.',
    }),
    ApiAcceptedResponse({
      description: 'Generation accepted; client should poll the status endpoint.',
      schema: {
        example: {
          success: true,
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
          success: true,
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
        'Source validation failed: wizard session not complete; upload_ids omitted ' +
        'when source=document_upload; or upload(s) not ready / not owned by the caller.',
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
          success: true,
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

export function FunnelControllerDecorators() {
  return applyDecorators(ApiTags('funnels'), ApiBearerAuth('JWT'));
}

export function ListFunnelsDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'List funnels (paginated)' }),
    ApiQuery({ name: 'page', required: false, schema: 
        { default: 1, minimum: 1, type: 'integer' } }),
    ApiQuery({ name: 'per_page', required: false, schema: { default: 20, maximum: 20, minimum: 1, type: 'integer' } }),
    ApiOkResponse({ description: 'Paginated funnel list', schema: { example: funnelListExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
  );
}

export function GetFunnelDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Get full funnel detail' }),
    ApiOkResponse({ description: 'Full funnel with stages and tasks', schema: { example: funnelFullExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiNotFoundResponse({ description: 'Funnel not found or not owned by the authenticated user', schema: { example: notFoundExample('/api/funnels/{id}') } }),
  );
}

export function GetStagesSummaryDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Get funnel stages summary' }),
    ApiOkResponse({ description: 'Lean funnel stage summary list', schema: { example: funnelStagesSummaryExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiNotFoundResponse({ description: 'Funnel not found or not owned by the authenticated user', schema: { example: notFoundExample('/api/funnels/{id}/stages') } }),
  );
}

export function GetStageDetailDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a single stage detail with lock enforcement' }),
    ApiOkResponse({ description: 'Unlocked stage details with tasks', schema: { example: funnelStageDetailExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiNotFoundResponse({ description: 'Funnel or stage not found, or funnel not owned by the authenticated user', schema: { example: notFoundExample('/api/funnels/{id}/stages/{stageId}') } }),
    ApiForbiddenResponse({ description: 'Stage is locked until the prior stage is completed', schema: { example: forbiddenStageLockedExample('/api/funnels/{id}/stages/{stageId}') } }),
  );
}

export function CompleteStageDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Complete an active funnel stage and unlock the next stage' }),
    ApiOkResponse({ description: 'Stage completed successfully', schema: { example: stageCompletionExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiNotFoundResponse({ description: 'Funnel or stage not found, or the stage does not belong to the caller', schema: { example: notFoundExample('/api/funnels/{id}/stages/{stageId}/complete') } }),
    ApiForbiddenResponse({ description: 'The requested stage is locked and cannot be completed yet', schema: { example: lockedStageExample('/api/funnels/{id}/stages/{stageId}/complete') } }),
    ApiUnprocessableEntityResponse({
      description: 'Funnel is not active, the stage has no tasks, or one or more tasks are still pending',
      schema: { example: stagePendingTasksExample('/api/funnels/{id}/stages/{stageId}/complete') },
    }),
  );
}
