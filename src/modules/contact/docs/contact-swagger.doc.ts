import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';

export const ContactSwaggerDocs = {
  create: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Submit a contact message',
        description: 'Accepts a contact form submission. Spam protection is applied automatically.',
      }),
      ApiCreatedResponse({
        description: SYS_MSG.CONTACT_MESSAGE_SENT_SUCCESSFULLY,
        schema: {
          example: {
            success: true,
            statusCode: HttpStatus.CREATED,
            message: SYS_MSG.CONTACT_MESSAGE_SENT_SUCCESSFULLY,
            data: {
              id: 'uuid',
              fullName: 'John Doe',
              email: 'john@example.com',
              businessName: 'Acme Inc.',
              message: 'Had a great week building my funnel!',
              status: 'pending',
              createdAt: '2026-05-18T00:00:00.000Z',
            },
          },
        },
      }),
      ApiBadRequestResponse({
        description: 'Validation failed or spam detected',
      }),
      ApiTooManyRequestsResponse({
        description: 'Too many requests',
      }),
    ),
};
