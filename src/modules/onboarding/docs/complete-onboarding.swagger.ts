import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CompleteOnboardingDto } from '../dto/complete-onboarding.dto';

export function CompleteOnboardingDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ 
      summary: 'Complete onboarding and write profile data',
      description: 'Validates the session, checks all 3 steps are answered, writes business data to user profile, and marks the session as complete.'
    }),
    ApiBody({ type: CompleteOnboardingDto }),
    ApiResponse({
      status: 200,
      description: 'Onboarding completed successfully',
      schema: {
        example: {
          status_code: 200,
          message: 'Onboarding completed successfully',
          data: {
            redirect: { to: 'funnel_generation' }
          }
        }
      }
    }),
    ApiResponse({
      status: 409,
      description: 'Onboarding already complete',
      schema: {
        example: {
          status_code: 409,
          message: 'Onboarding already complete',
          data: {
            redirect: { to: 'funnel_generation' }
          }
        }
      }
    }),
    ApiResponse({
      status: 403,
      description: 'Session expired',
      schema: {
        example: {
          status_code: 403,
          message: 'Session expired'
        }
      }
    }),
    ApiResponse({
      status: 404,
      description: 'Session not found',
      schema: {
        example: {
          status_code: 404,
          message: 'Session not found'
        }
      }
    }),
    ApiResponse({
      status: 422,
      description: 'Onboarding incomplete',
      schema: {
        example: {
          status_code: 422,
          message: 'Onboarding incomplete',
          missing_fields: ['step_1', 'step_2', 'step_3']
        }
      }
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Missing or invalid bearer token'
    })
  );
}