import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { JoinWaitlistDto } from '../dto/join-waitlist.dto';

export function ApiJoinWaitlist() {
  return applyDecorators(
    ApiOperation({ summary: 'Join the waitlist' }),
    ApiBody({ type: JoinWaitlistDto }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Successfully joined the waitlist',
      schema: {
        example: {
          success: true,
          message: SYS_MSG.WAITLIST_JOINED_SUCCESSFULLY,
          data: {
            id: 'uuid-string',
            email: 'johndoe@example.com',
            is_notified: false,
            created_at: '2026-05-16T10:00:00.000Z',
            updated_at: '2026-05-16T10:00:00.000Z',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'User is already on the waitlist (idempotent)',
      schema: {
        example: {
          success: true,
          message: SYS_MSG.WAITLIST_ALREADY_JOINED,
          data: {
            id: 'uuid-string',
            email: 'johndoe@example.com',
            is_notified: false,
            created_at: '2026-05-16T10:00:00.000Z',
            updated_at: '2026-05-16T10:00:00.000Z',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed',
      schema: {
        example: {
          success: false,
          statusCode: 400,
          error: 'Bad Request',
          message: SYS_MSG.VALIDATION_FAILED,
          details: ['email: email must be an email'],
        },
      },
    }),
  );
}
