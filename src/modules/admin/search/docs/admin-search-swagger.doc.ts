import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminSearchResponseDto } from '../dto/admin-search-response.dto';

export function GetAdminSearchDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Admin global search',
      description: 'Search across users by name or email. Returns up to 10 results. Exact matches are prioritized first.',
    }),
    ApiQuery({
      name: 'q',
      required: true,
      type: String,
      description: 'Search query (minimum 2 characters)',
      example: 'john',
    }),
    ApiOkResponse({
      description: 'Search results retrieved successfully',
      type: AdminSearchResponseDto,
    }),
    ApiUnprocessableEntityResponse({
      description: 'Validation failed (e.g. query query length less than 2)',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.VALIDATION_FAILED,
          details: ['q: Search query must be at least 2 characters long'],
        },
      },
    }),
    ApiForbiddenResponse({
      description: 'Access denied for non-admin users',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.ADMIN_ACCESS_DENIED,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Unauthorized access',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
        },
      },
    }),
  );
}