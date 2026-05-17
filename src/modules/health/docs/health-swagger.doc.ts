import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export function HealthCheckDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Liveness and readiness probe' }),
    ApiResponse({ status: HttpStatus.OK, description: 'All services healthy.' }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'One or more services degraded. Orchestrators should stop routing traffic.',
    }),
  );
}
