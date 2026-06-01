import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { CreateAdminDto } from '../dto/create-admin.dto';

export function CreateAdminDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Create an admin or super-admin account',
      description: 'Requires a super-admin JWT. Creates a new user and assigns the specified admin role.',
    }),
    ApiBody({ type: CreateAdminDto }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY,
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY,
          data: null,
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CONFLICT, description: SYS_MSG.ADMIN_EMAIL_CONFLICT }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid admin JWT' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: SYS_MSG.ADMIN_ACCESS_DENIED }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
  );
}
