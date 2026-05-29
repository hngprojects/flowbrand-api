import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiInternalServerErrorResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

export function TriggerReaperDocs() {
  return applyDecorators(
    ApiTags('Tasks'),
    ApiOperation({ 
      summary: 'Manually trigger the background reaper',
      description: 'Force-runs the background sweeping tasks without waiting for the next cron tick. ' +
                   'It checks the database for any Funnels older than 8 minutes stuck in `GENERATING`, ' +
                   'and Uploads older than 5 minutes stuck in `PARSING`, and marks them as `FAILED`.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'The background reaper completed its sweep successfully.',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.REAPER_TRIGGERED_SUCCESSFULLY,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid authentication token (if endpoint is secured).',
      schema: {
        example: {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
        },
      },
    }),
    ApiInternalServerErrorResponse({
      description: 'An unexpected error occurred while querying the database or sweeping.',
      schema: {
        example: {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: SYS_MSG.HTTP_INTERNAL_SERVER_ERROR,
        },
      },
    }),
  );
}