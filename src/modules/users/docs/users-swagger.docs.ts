import { HttpStatus, applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ChangePasswordDto } from '../dto/change-password.dto';
import * as SYS_MSG from '../../../constants/system.messages';

export const ChangePasswordDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Change user password',
      description:
        'Allows an authenticated user to change their password from the Password & Security settings tab. ' +
        'Verifies the current password, enforces the password policy, and on success revokes all active sessions ' +
        'across all devices — the user will need to log in again. ' +
        'Google OAuth accounts without a password hash cannot use this endpoint.',
    }),
    ApiBody({ type: ChangePasswordDto }),
    ApiOkResponse({
      description: 'Password changed successfully. All sessions have been revoked.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PASSWORD_CHANGE_SUCCESSFUL,
          data: null,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid bearer token, or current password is incorrect.',
      schema: {
        examples: {
            invalidToken: {
                summary: 'Invalid token',
                value: {
                    success: false,
                    statusCode: HttpStatus.UNAUTHORIZED,
                    error: 'UnauthorizedException',
                    message: SYS_MSG.AUTH_INVALID_TOKEN,
                }
            },
            incorrectPassword: {
                summary: 'Current password is incorrect',
                value: {
                    success: false,
                    statusCode: HttpStatus.UNAUTHORIZED,
                    error: 'UnauthorizedException',
                    message: SYS_MSG.INCORRECT_OLD_PASSWORD,
                }
            }
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'New password and confirm password do not match.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequestException',
          message: SYS_MSG.INCORRECT_CONFIRM_PASSWORD,
        },
      },
    }),
    ApiUnprocessableEntityResponse({
      description: 'Google OAuth account or new password is the same as the old password.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.PASSWORD_CHANGE_NOT_SUPPORTED,
        },
      },
    }),
  );