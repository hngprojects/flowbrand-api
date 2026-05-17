import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CompleteOnboardingDto } from '../dto/complete-onboarding.dto';
import * as SYS_MSG from '../../../constants/system.messages';

export function CompleteOnboardingDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ 
      summary: 'Complete onboarding and write profile data',
      description: 'Validates the session, checks all 3 steps are answered, writes business data to user profile, and marks the session as complete.'
    }),
    ApiBody({ type: CompleteOnboardingDto }),
    ApiResponse({
      description: 'Onboarding completed successfully',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ONBOARDING_COMPLETE_SUCCESS,
          data: {
            redirect: { to: 'funnel_generation' }
          }
        }
      }
    }),
    ApiResponse({
      description: 'Onboarding already complete',
      schema: {
        example: {
          statusCode: HttpStatus.CONFLICT,
          message: SYS_MSG.ONBOARDING_ALREADY_COMPLETE,
          data: {
            redirect: { to: 'funnel_generation' }
          }
        }
      }
    }),
    ApiResponse({
      description: 'Session expired',
      schema: {
        example: {
          statusCode: HttpStatus.FORBIDDEN,
          message: SYS_MSG.ONBOARDING_SESSION_EXPIRED
        }
      }
    }),
    ApiResponse({
      description: 'Session not found',
      schema: {
        example: {
          statusCode: HttpStatus.NOT_FOUND,
          message: SYS_MSG.ONBOARDING_SESSION_NOT_FOUND
        }
      }
    }),
    ApiResponse({
      description: 'Onboarding incomplete',
      schema: {
        example: {
          statusCode: 422,
          message: SYS_MSG.ONBOARDING_INCOMPLETE,
          missing_fields: ['step_1', 'step_2', 'step_3']
        }
      }
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Unauthorized - Missing or invalid bearer token'
    })
  );
}