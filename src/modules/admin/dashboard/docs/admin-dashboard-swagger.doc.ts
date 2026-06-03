// src/modules/admin/dashboard/docs/admin-dashboard.doc.ts

import { applyDecorators, HttpStatus } from '@nestjs/common';
import { 
  ApiBearerAuth, 
  ApiOkResponse, 
  ApiOperation, 
  ApiUnauthorizedResponse, 
  ApiResponse,
  ApiExtraModels,
  getSchemaPath
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { 
  DashboardStatsDataDto, 
  WeeklyOverviewItemDto, 
  UserSegmentItemDto, 
  FunnelPerformanceItemDto 
} from '../dtos/admin-dashboard.dto';

// Reusable error decorators to avoid duplication
const CommonErrorResponses = () => applyDecorators(
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
  })
);

export function GetStatsDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({ summary: 'Get admin dashboard headline stats' }),
    ApiExtraModels(DashboardStatsDataDto),
    ApiOkResponse({
      description: 'Dashboard stats retrieved successfully',
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
    ApiOperation({ summary: 'Get admin dashboard weekly overview chart data' }),
    ApiExtraModels(WeeklyOverviewItemDto),
    ApiOkResponse({
      description: 'Dashboard weekly overview retrieved successfully',
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
    ApiOperation({ summary: 'Get admin dashboard user segments donut chart data' }),
    ApiExtraModels(UserSegmentItemDto),
    ApiOkResponse({
      description: 'Dashboard user segments retrieved successfully',
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
    ApiOperation({ summary: 'Get admin dashboard funnel performance horizontal bar chart data' }),
    ApiExtraModels(FunnelPerformanceItemDto),
    ApiOkResponse({
      description: 'Dashboard funnel performance retrieved successfully',
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