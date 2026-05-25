import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { JoinWaitlistDto } from '../dto/join-waitlist.dto';

const waitlistEntryExample = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'johndoe@example.com',
  is_notified: false,
  created_at: '2026-05-16T10:00:00.000Z',
  updated_at: '2026-05-16T10:00:00.000Z',
};

export const JoinWaitlistDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Join the waitlist',
      description:
        'Adds the supplied email to the SEIL waitlist and queues a confirmation email. ' +
        'Returns 201 when the email is newly added. ' +
        'Returns 200 when the email is already on the waitlist (idempotent, no duplicate email is sent).',
    }),
    ApiBody({ type: JoinWaitlistDto }),
    ApiCreatedResponse({
      description: 'Email added to the waitlist and confirmation email queued.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.WAITLIST_JOINED_SUCCESSFULLY,
          data: waitlistEntryExample,
        },
      },
    }),
    ApiOkResponse({
      description: 'Email is already on the waitlist (idempotent).',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.WAITLIST_ALREADY_JOINED,
          data: waitlistEntryExample,
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Validation failed (invalid email format or missing field).',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequestException',
          message: SYS_MSG.VALIDATION_FAILED,
          details: ['email must be an email'],
        },
      },
    }),
  );
