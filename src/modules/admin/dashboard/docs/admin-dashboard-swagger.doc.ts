// src/modules/admin/dashboard/docs/admin-dashboard.doc.ts

import { applyDecorators, HttpStatus } from '@nestjs/common';
import { 
  ApiBearerAuth, 
  ApiOkResponse, 
  ApiOperation, 
  ApiUnauthorizedResponse, 
  ApiResponse 
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
    ApiOkResponse({
      description: 'Dashboard stats retrieved successfully',
      type: DashboardStatsDataDto,
    }),
    CommonErrorResponses(),
  );
}

export function GetWeeklyOverviewDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({ summary: 'Get admin dashboard weekly overview chart data' }),
    ApiOkResponse({
      description: 'Dashboard weekly overview retrieved successfully',
      type: [WeeklyOverviewItemDto],
    }),
    CommonErrorResponses(),
  );
}

export function GetUserSegmentsDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({ summary: 'Get admin dashboard user segments donut chart data' }),
    ApiOkResponse({
      description: 'Dashboard user segments retrieved successfully',
      type: [UserSegmentItemDto],
    }),
    CommonErrorResponses(),
  );
}

export function GetFunnelPerformanceDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({ summary: 'Get admin dashboard funnel performance horizontal bar chart data' }),
    ApiOkResponse({
      description: 'Dashboard funnel performance retrieved successfully',
      type: [FunnelPerformanceItemDto],
    }),
    CommonErrorResponses(),
  );
}