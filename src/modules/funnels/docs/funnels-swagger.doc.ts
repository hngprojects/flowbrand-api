import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { RenameFunnelDto } from '../dto/rename-funnel.dto';
import * as SYS_MSG from '../../../constants/system.messages';

// ============================================================================
// Swagger Example Responses
// ============================================================================

const FUNNEL_ID_EXAMPLE = '550e8400-e29b-41d4-a716-446655440001';

export const funnelListExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.FUNNELS_RETRIEVED_SUCCESSFULLY,
  data: {
    funnels: [
      {
        funnelId: FUNNEL_ID_EXAMPLE,
        businessName: 'Acme Studio',
        creationPath: 'google-ads',
        status: 'active',
        createdAt: '2026-05-18T12:00:00.000Z',
        stages: [{ position: 1, name: 'Discovery', status: 'complete', tasksTotal: 3, tasksComplete: 3 }],
      },
    ],
    pagination: {
      total: 1,
      page: 1,
      perPage: 20,
      hasNext: false,
    },
  },
};


export const funnelFullExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.FUNNEL_RETRIEVED_SUCCESSFULLY,
  data: {
    funnelId: FUNNEL_ID_EXAMPLE,
    businessName: 'Acme Studio',
    creationPath: 'google-ads',
    status: 'active',
    createdAt: '2026-05-18T12:00:00.000Z',
    stages: [
      {
        stageId: '550e8400-e29b-41d4-a716-446655440010',
        position: 1,
        name: 'Discovery',
        channel: 'email',
        status: 'complete',
        unlockedAt: '2026-05-17T12:00:00.000Z',
        completedAt: '2026-05-17T13:00:00.000Z',
        explanation: 'Understand the target audience.',
        actionPrompt: 'Review the lead magnet.',
        tasks: [{ id: 'task-1', position: 1, name: 'Define ICP', status: 'complete' }],
        tasksTotal: 1,
        tasksComplete: 1,
      },
    ],
  },
};

export const funnelStagesSummaryExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.FUNNEL_STAGES_RETRIEVED_SUCCESSFULLY,
  data: [
    {
      stageId: '550e8400-e29b-41d4-a716-446655440010',
      position: 1,
      name: 'Discovery',
      channel: 'email',
      status: 'complete',
      unlockedAt: '2026-05-17T12:00:00.000Z',
      completedAt: '2026-05-17T13:00:00.000Z',
      tasksTotal: 1,
      tasksComplete: 1,
    },
  ],
};

export const funnelStageDetailExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.FUNNEL_STAGE_RETRIEVED_SUCCESSFULLY,
  data: {
    stageId: '550e8400-e29b-41d4-a716-446655440010',
    position: 2,
    name: 'Validation',
    channel: 'email',
    status: 'active',
    unlockedAt: '2026-05-18T12:00:00.000Z',
    completedAt: null,
    explanation: 'Validate demand before moving on.',
    actionPrompt: 'Contact the first five leads.',
    tasks: [{ id: 'task-2', position: 1, name: 'Send outreach', status: 'pending' }],
    tasksTotal: 1,
    tasksComplete: 0,
  },
};

export const unauthorizedExample = {
  success: false,
  statusCode: HttpStatus.UNAUTHORIZED,
  error: 'UnauthorizedException',
  message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
  path: '/api/funnels',
  timestamp: '2026-05-18T12:00:00.000Z',
};

export const notFoundExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.NOT_FOUND,
  error: 'NotFoundException',
  message: path.includes('/stages/') ? SYS_MSG.FUNNEL_OR_STAGE_NOT_FOUND : SYS_MSG.FUNNEL_NOT_FOUND,
  path,
  timestamp: '2026-05-18T12:00:00.000Z',
});

export const forbiddenStageLockedExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.FORBIDDEN,
  error: 'ForbiddenException',
  message: SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE('Validation', 'Discovery'),
  path,
  timestamp: '2026-05-18T12:00:00.000Z',
});

export const stageCompletionExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.STAGE_COMPLETED_SUCCESSFULLY,
  data: {
    completedStage: {
      stageId: '550e8400-e29b-41d4-a716-446655440011',
      position: 1,
      name: 'Get Noticed',
      status: 'complete',
      completedAt: '2026-05-26T10:00:00.000Z',
    },
    unlockedStage: {
      stageId: '550e8400-e29b-41d4-a716-446655440012',
      position: 2,
      name: 'Spark Interest',
      status: 'active',
      unlockedAt: '2026-05-26T10:00:00.000Z',
    },
  },
};

export const stagePendingTasksExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  error: 'UnprocessableEntityException',
  message: SYS_MSG.STAGE_HAS_PENDING_TASKS(2),
  path,
  timestamp: '2026-05-26T10:00:00.000Z',
});

export const lockedStageExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.FORBIDDEN,
  error: 'ForbiddenException',
  message: SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE('Validation', 'Discovery'),
  path,
  timestamp: '2026-05-26T10:00:00.000Z',
});


// ============================================================================
// Decorator Factories
// ============================================================================

export function FunnelControllerDecorators() {
  return applyDecorators(ApiTags('funnels'), ApiBearerAuth('JWT'));
}

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
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
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
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', schema: { example: unauthorizedExample } }),
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

export function ListFunnelsDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'List funnels (paginated)' }),
    ApiQuery({ name: 'page', required: false, schema: { default: 1, minimum: 1, type: 'integer' } }),
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

export const taskUpdateSuccessExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.TASK_STATUS_UPDATED_SUCCESSFULLY,
  data: {
    taskId: '550e8400-e29b-41d4-a716-446655440020',
    name: 'Define ICP',
    status: 'complete',
    isComplete: true,
    completedAt: '2026-05-26T10:00:00.000Z',
    position: 1,
  },
};

export const taskUpdateIdempotentExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.TASK_STATUS_UPDATED_SUCCESSFULLY,
  data: {
    taskId: '550e8400-e29b-41d4-a716-446655440020',
    name: 'Define ICP',
    status: 'pending',
    isComplete: false,
    completedAt: null,
    position: 1,
  },
};

export const taskNotFoundExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.NOT_FOUND,
  error: 'NotFoundException',
  message: SYS_MSG.FUNNEL_TASK_NOT_FOUND,
  path,
  timestamp: '2026-05-26T10:00:00.000Z',
});

export const taskStageLockedExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.FORBIDDEN,
  error: 'ForbiddenException',
  message: SYS_MSG.FUNNEL_STAGE_LOCKED_MESSAGE('Spark Interest', 'Get Noticed'),
  path,
  timestamp: '2026-05-26T10:00:00.000Z',
});

export const taskValidationFailedExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.BAD_REQUEST,
  error: 'BadRequestException',
  message: ['status must be one of the following values: pending, complete'],
  path,
  timestamp: '2026-05-26T10:00:00.000Z',
});

export function UpdateTaskStatusDecorators() {
  const path = '/api/funnels/{funnelId}/stages/{stageId}/tasks/{taskId}';
  return applyDecorators(
    ApiOperation({
      summary: 'Mark a funnel stage task as complete or incomplete',
      description:
        'Toggles a single task between `pending` and `complete`. The parent stage ' +
        'must not be locked. Marking an already-complete task complete (or a pending ' +
        'task pending) is idempotent and returns 200 with the current state.',
    }),
    ApiOkResponse({ description: 'Task status updated successfully', schema: { example: taskUpdateSuccessExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiForbiddenResponse({ description: 'Parent stage is locked', schema: { example: taskStageLockedExample(path) } }),
    ApiNotFoundResponse({
      description: 'Funnel, stage, or task not found, or not owned by the authenticated user',
      schema: { example: taskNotFoundExample(path) },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed (status missing or not one of pending/complete)',
      schema: { example: taskValidationFailedExample(path) },
    }),
  );
}

export const feedbackSuccessExample = {
  success: true,
  statusCode: HttpStatus.CREATED,
  message: SYS_MSG.FEEDBACK_SUBMITTED,
  data: {
    feedbackId: '550e8400-e29b-41d4-a716-446655440000',
    stageId: '550e8400-e29b-41d4-a716-446655440010',
    comment: 'This stage was really useful.',
    submittedAt: '2026-05-26T10:00:00.000Z',
  },
};

export const feedbackConflictExample = {
  success: false,
  statusCode: HttpStatus.CONFLICT,
  error: 'ConflictException',
  message: SYS_MSG.FEEDBACK_ALREADY_SUBMITTED,
  timestamp: '2026-05-26T10:00:00.000Z',
};

export const feedbackNotCompleteExample = {
  success: false,
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  error: 'UnprocessableEntityException',
  message: SYS_MSG.FEEDBACK_STAGE_NOT_COMPLETE,
  timestamp: '2026-05-26T10:00:00.000Z',
};

export const renameFunnelSuccessExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.FUNNEL_RENAMED_SUCCESSFULLY,
  data: {
    id: FUNNEL_ID_EXAMPLE,
    funnelName: 'Jollof Spot Lagos',
    status: 'active',
    creationPath: 'wizard',
    createdAt: '2026-05-18T12:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  },
};

export const renameFunnelValidationExample = (path: string) => ({
  success: false,
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  error: 'UnprocessableEntityException',
  message: SYS_MSG.VALIDATION_FAILED,
  path,
  timestamp: '2026-05-26T10:00:00.000Z',
});

export function RenameFunnelDecorators() {
  const path = '/api/funnels/{id}/rename';
  return applyDecorators(
    ApiOperation({
      summary: 'Rename a funnel',
      description:
        'Updates the display name (`funnel_name`) for an owned funnel. ' +
        'Does not affect stages, tasks, or generated content. ' +
        'Submitting the same name after trim returns 200 without a database write.',
    }),
    ApiBody({ type: RenameFunnelDto }),
    ApiOkResponse({ description: 'Funnel renamed (or unchanged)', schema: { example: renameFunnelSuccessExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiBadRequestResponse({ description: 'Invalid funnel id (not a UUID)' }),
    ApiNotFoundResponse({
      description: 'Funnel not found or not owned by the authenticated user',
      schema: { example: notFoundExample(path) },
    }),
    ApiUnprocessableEntityResponse({
      description: 'Empty or whitespace-only name, or name longer than 255 characters',
      schema: { example: renameFunnelValidationExample(path) },
    }),
  );
}

export function SubmitFeedbackDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Submit feedback for a completed stage' }),
    ApiCreatedResponse({ description: 'Feedback successfully submitted', schema: { example: feedbackSuccessExample } }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: unauthorizedExample } }),
    ApiNotFoundResponse({ description: 'Funnel or stage not found', schema: { example: notFoundExample('/api/funnels/{funnelId}/stages/{stageId}/feedback') } }),
    ApiConflictResponse({ description: 'Feedback already submitted for this stage', schema: { example: feedbackConflictExample } }),
    ApiUnprocessableEntityResponse({ description: 'Stage is not complete', schema: { example: feedbackNotCompleteExample } }),
  );
}