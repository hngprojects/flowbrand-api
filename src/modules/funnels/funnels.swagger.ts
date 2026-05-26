import { HttpStatus, applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../constants/system.messages';

/**
 * Decorator factories for Funnel Display API endpoints
 * Each factory composes all required Swagger decorators for an endpoint
 */

export function FunnelControllerDecorators() {
  return applyDecorators(ApiTags('funnels'), ApiBearerAuth('JWT'));
}

export function ListFunnelsDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'List funnels (paginated)' }),
    ApiQuery({ name: 'page', required: false, schema: { default: 1, minimum: 1, type: 'integer' } }),
    ApiQuery({ name: 'per_page', required: false, schema: { default: 20, maximum: 20, minimum: 1, type: 'integer' } }),
    ApiOkResponse({ description: 'Paginated funnel list', schema: { example: funnelListExample } }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token',
      schema: { example: unauthorizedExample },
    }),
  );
}

export function GetFunnelDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Get full funnel detail' }),
    ApiOkResponse({ description: 'Full funnel with stages and tasks', schema: { example: funnelFullExample } }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token',
      schema: { example: unauthorizedExample },
    }),
    ApiNotFoundResponse({
      description: 'Funnel not found or not owned by the authenticated user',
      schema: { example: notFoundExample('/api/funnels/{id}') },
    }),
  );
}

export function GetStagesSummaryDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Get funnel stages summary' }),
    ApiOkResponse({ description: 'Lean funnel stage summary list', schema: { example: funnelStagesSummaryExample } }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token',
      schema: { example: unauthorizedExample },
    }),
    ApiNotFoundResponse({
      description: 'Funnel not found or not owned by the authenticated user',
      schema: { example: notFoundExample('/api/funnels/{id}/stages') },
    }),
  );
}

export function GetStageDetailDecorators() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a single stage detail with lock enforcement' }),
    ApiOkResponse({ description: 'Unlocked stage details with tasks', schema: { example: funnelStageDetailExample } }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token',
      schema: { example: unauthorizedExample },
    }),
    ApiNotFoundResponse({
      description: 'Funnel or stage not found, or funnel not owned by the authenticated user',
      schema: { example: notFoundExample('/api/funnels/{id}/stages/{stageId}') },
    }),
    ApiForbiddenResponse({
      description: 'Stage is locked until the prior stage is completed',
      schema: { example: forbiddenStageLockedExample('/api/funnels/{id}/stages/{stageId}') },
    }),
  );
}

// ============================================================================
// Swagger Example Responses
// ============================================================================

export const funnelListExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: 'Operation successful',
  data: {
    funnels: [
      {
        funnelId: '550e8400-e29b-41d4-a716-446655440001',
        businessName: 'Acme Studio',
        creationPath: 'google-ads',
        status: 'active',
        createdAt: '2026-05-18T12:00:00.000Z',
        stages: [{ position: 1, name: 'Discovery', status: 'complete' }],
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
  message: 'Operation successful',
  data: {
    funnelId: '550e8400-e29b-41d4-a716-446655440001',
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
  message: 'Operation successful',
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
  message: 'Operation successful',
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