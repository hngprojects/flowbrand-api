import { applyDecorators, HttpStatus } from '@nestjs/common';
import { 
  ApiBearerAuth, 
  ApiOperation, 
  ApiUnauthorizedResponse, 
  ApiNotFoundResponse,
  ApiOkResponse, 
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

export function GetUserStateDocs() {
  return applyDecorators(
    ApiBearerAuth("Jwt"),

    ApiOperation({
      summary: 'Get dashboard state for authenticated user',
      description:
        'Returns the complete app state for a returning authenticated user in a single read-only call. ' +
        'Resolves onboarding status, most recent non-failed funnel, and current active stage. ' +
        'Response is cached per-user in Redis for 20 seconds. ' +
        'Cache is invalidated automatically on funnel status change or stage unlock.',
    }),

    // ─── 200: active funnel, stage in progress ───────────────────────────────
    ApiOkResponse({
      description:
        '[Scenario 1] Onboarding complete — user has an active funnel with a stage currently in progress.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: {
              status: 'complete',
            },
            activeFunnel: {
              funnelId: '550e8400-e29b-41d4-a716-446655440000',
              businessName: 'My Business',
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              currentStage: {
                stageId: '550e8400-e29b-41d4-a716-446655440001',
                position: 2,
                name: 'Spark Interest',
                status: 'active',
                unlockedAt: '2026-01-02T00:00:00.000Z',
                tasksTotal: 4,
                tasksComplete: 1,
              },
            },
          },
        },
      },
    }),

    // ─── 200: active funnel, all stages complete ─────────────────────────────
    ApiOkResponse({
      description:
        '[Scenario 2] Onboarding complete — user has an active funnel but all stages are finished. currentStage is null.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: {
              status: 'complete',
            },
            activeFunnel: {
              funnelId: '550e8400-e29b-41d4-a716-446655440000',
              businessName: 'My Business',
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              currentStage: null,
            },
          },
        },
      },
    }),

    // ─── 200: funnel still generating ────────────────────────────────────────
    ApiOkResponse({
      description:
        '[Scenario 3] Onboarding complete — funnel is still being generated. No stage data available yet.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: {
              status: 'complete',
            },
            activeFunnel: {
              funnelId: '550e8400-e29b-41d4-a716-446655440000',
              businessName: 'My Business',
              status: 'generating',
              createdAt: '2026-01-01T00:00:00.000Z',
              currentStage: null,
            },
          },
        },
      },
    }),

    // ─── 200: onboarding complete, no funnel yet ──────────────────────────────
    ApiOkResponse({
      description:
        '[Scenario 4] Onboarding complete — user has not generated a funnel yet. activeFunnel is null.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: {
              status: 'complete',
            },
            activeFunnel: null,
          },
        },
      },
    }),

    // ─── 200: onboarding in progress ─────────────────────────────────────────
    ApiOkResponse({
      description:
        '[Scenario 5] User has an active (non-expired) onboarding session in progress. sessionId and stepsCompleted are populated. activeFunnel is null.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: {
              status: 'in_progress',
              sessionId: '550e8400-e29b-41d4-a716-446655440002',
              stepsCompleted: 2,
            },
            activeFunnel: null,
          },
        },
      },
    }),

    // ─── 200: never started onboarding ───────────────────────────────────────
    ApiOkResponse({
      description:
        '[Scenario 6] User has never started onboarding. Both onboarding.status and activeFunnel are at their zero state.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: {
              status: 'not_started',
            },
            activeFunnel: null,
          },
        },
      },
    }),

    // ─── 401 ─────────────────────────────────────────────────────────────────
    ApiUnauthorizedResponse({
      description: 'No JWT token provided or token is invalid.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: SYS_MSG.USER_UNAUTHORIZED,
        },
      },
    }),

    // ─── 404 ─────────────────────────────────────────────────────────────────
    ApiNotFoundResponse({
      description:
        'JWT is valid but the userId encoded in the token does not match any user record.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: SYS_MSG.USER_NOT_FOUND_BY_TOKEN,
        },
      },
    }),
  );
}