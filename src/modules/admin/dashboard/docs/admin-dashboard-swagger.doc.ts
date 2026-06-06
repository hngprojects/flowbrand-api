import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import {
  DashboardStatsDataDto,
  FunnelPerformanceItemDto,
  PlanDistributionDto,
  RetentionBandItemDto,
  UserSegmentItemDto,
  UserStageItemDto,
  WeeklyOverviewItemDto,
} from '../dtos/admin-dashboard.dto';

// ---------------------------------------------------------------------------
// Reusable error decorators
// ---------------------------------------------------------------------------

const CommonErrorResponses = () =>
  applyDecorators(
    ApiUnauthorizedResponse({
      description: 'Missing or invalid admin JWT',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'User does not have admin privileges',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.ADMIN_ACCESS_DENIED,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'Internal server error',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'InternalServerError',
          message: SYS_MSG.HTTP_INTERNAL_SERVER_ERROR,
        },
      },
    }),
  );

// ---------------------------------------------------------------------------
// Endpoint decorators
// ---------------------------------------------------------------------------

export function GetStatsDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get admin dashboard headline stats',
      description:
        'Returns platform-wide KPIs: total users, active users (last 30 days), total funnels generated, funnels created this week, and a free/pro plan distribution breakdown. Response is served from a
    }),
    ApiExtraModels(DashboardStatsDataDto, PlanDistributionDto),
    ApiOkResponse({
      description: SYS_MSG.ADMIN_DASHBOARD_STATS_RETRIEVED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.ADMIN_DASHBOARD_STATS_RETRIEVED },
          data: { $ref: getSchemaPath(DashboardStatsDataDto) },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function GetWeeklyOverviewDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get admin dashboard weekly overview chart data',
      description:
        'Returns time-series buckets of new user registrations and funnels created. ' +
        'Use `?period=7d` (default) for 7 daily buckets or `?period=12w` for 12 ISO-week buckets. ' +
        'Each period variant is cached independently under its own Redis key at a 5-minute TTL.',
    }),
    ApiQuery({
      name: 'period',
      required: false,
      enum: ['7d', '12w'],
      description: '`7d` — 7 daily buckets (default). `12w` — 12 ISO-week buckets starting on Monday.',
    }),
    ApiExtraModels(WeeklyOverviewItemDto),
    ApiOkResponse({
      description: SYS_MSG.ADMIN_DASHBOARD_WEEKLY_OVERVIEW_RETRIEVED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.ADMIN_DASHBOARD_WEEKLY_OVERVIEW_RETRIEVED },
          data: { type: 'array', items: { $ref: getSchemaPath(WeeklyOverviewItemDto) } },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function GetUserSegmentsDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get admin dashboard user segments donut chart data',
      description:
        'Groups users by their `business_type` field and returns each segment with a count and percentage share summing to 100. Response is served from a 5-minute Redis cache.',
    }),
    ApiExtraModels(UserSegmentItemDto),
    ApiOkResponse({
      description: SYS_MSG.ADMIN_DASHBOARD_USER_SEGMENTS_RETRIEVED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.ADMIN_DASHBOARD_USER_SEGMENTS_RETRIEVED },
          data: { type: 'array', items: { $ref: getSchemaPath(UserSegmentItemDto) } },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function GetFunnelPerformanceDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get admin dashboard funnel performance horizontal bar chart data',
      description:
        'Returns the completion rate for each funnel stage position (1, 2, 3) across all platform funnels. Response is served from a 5-minute Redis cache.',
    }),
    ApiExtraModels(FunnelPerformanceItemDto),
    ApiOkResponse({
      description: SYS_MSG.ADMIN_DASHBOARD_FUNNEL_PERFORMANCE_RETRIEVED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.ADMIN_DASHBOARD_FUNNEL_PERFORMANCE_RETRIEVED },
          data: { type: 'array', items: { $ref: getSchemaPath(FunnelPerformanceItemDto) } },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function GetUserStagesDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get admin dashboard user lifecycle stages donut chart data',
      description:
        'Returns six lifecycle stage counts derived from existing tables (no dedicated analytics table required): ' +
        '`signedUp` (all users), `intakeDone` (business_type + target_customer + primary_goal all set), ' +
        '`createdStrategies` (≥1 active/failed funnel), `stage1Active`, `stage2Active`, `stage3Active` ' +
        '(≥1 funnel stage at position 1/2/3 in active or complete status). Response is served from a 5-minute Redis cache.',
    }),
    ApiExtraModels(UserStageItemDto),
    ApiOkResponse({
      description: SYS_MSG.ADMIN_DASHBOARD_USER_STAGES_RETRIEVED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.ADMIN_DASHBOARD_USER_STAGES_RETRIEVED },
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(UserStageItemDto) },
            example: [
              { stage: 'signedUp', label: 'Signed up', count: 184 },
              { stage: 'intakeDone', label: 'Intake done', count: 14 },
              { stage: 'createdStrategies', label: 'Created strategies', count: 20 },
              { stage: 'stage1Active', label: 'Stage 1 active', count: 42 },
              { stage: 'stage2Active', label: 'Stage 2 active', count: 142 },
              { stage: 'stage3Active', label: 'Stage 3 active', count: 138 },
            ],
          },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function GetUserRetentionDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get admin dashboard user retention cohort chart data',
      description:
        'Buckets all users into four retention bands by account age (derived from `created_at`): ' +
        '`lessThan1Week` (< 7 days), `1To4Weeks` (7–28 days), `1To3Months` (28–90 days), `over3Months` (> 90 days). ' +
        'Response is served from a 5-minute Redis cache.',
    }),
    ApiExtraModels(RetentionBandItemDto),
    ApiOkResponse({
      description: SYS_MSG.ADMIN_DASHBOARD_USER_RETENTION_RETRIEVED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.ADMIN_DASHBOARD_USER_RETENTION_RETRIEVED },
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(RetentionBandItemDto) },
            example: [
              { band: 'lessThan1Week', label: '< 1 week', count: 184 },
              { band: '1To4Weeks', label: '1–4 weeks', count: 93 },
              { band: '1To3Months', label: '1–3 months', count: 64 },
              { band: 'over3Months', label: '3+ months', count: 42 },
            ],
          },
        },
      },
    }),
    CommonErrorResponses(),
  );
}
