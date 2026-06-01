import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../../constants/system.messages';
import { CreateAdminDto } from '../dto/create-admin.dto';

export function CreateAdminDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Create an admin or super-admin account',
      description:
        'Creates a new user and assigns the specified role (`admin` or `super_admin`). ' +
        'Requires a `super_admin`-scoped JWT — a regular `admin` token returns 403. ' +
        'The response never includes the created user object; only a success message is returned.',
    }),
    ApiBody({ type: CreateAdminDto }),
    ApiCreatedResponse({
      description: 'Admin account created successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY,
          data: null,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid admin JWT',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'UnauthorizedException',
          message: 'Unauthenticated',
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'JWT present but role is `admin` — only `super_admin` can create new admins',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          error: 'ForbiddenException',
          message: SYS_MSG.ADMIN_ACCESS_DENIED,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'Email address is already registered',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          error: 'ConflictException',
          message: SYS_MSG.ADMIN_EMAIL_CONFLICT,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed — missing fields, weak password, or invalid role value',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequestException',
          message: 'Validation failed',
        },
      },
    }),
  );
}
