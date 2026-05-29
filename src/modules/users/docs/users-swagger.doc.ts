import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiResponse,
} from '@nestjs/swagger';
import * as SYS_MSG from '../../../constants/system.messages';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';
import { UploadAvatarDto } from '../dto/upload-avatar.dto';
import { UserAvatarResponseDto } from '../dto/user-avatar-response.dto';
import { DeleteAccountDto } from '../dto/delete-account.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

const profileDataExample = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  country: 'Nigeria',
  avatarUrl: null,
  authProvider: 'local',
  isVerified: true,
  createdAt: '2024-01-15T10:30:00.000Z',
  updatedAt: '2024-06-01T08:00:00.000Z',
};

const unauthorizedExample = {
  success: false,
  statusCode: HttpStatus.UNAUTHORIZED,
  error: 'UnauthorizedException',
  message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
};

const notFoundExample = {
  success: false,
  statusCode: HttpStatus.NOT_FOUND,
  error: 'NotFoundException',
  message: SYS_MSG.PROFILE_NOT_FOUND,
};

const avatarUploadedExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.PROFILE_AVATAR_UPLOADED_SUCCESSFULLY,
  data: {
    avatarUrl:
      'https://storage.example.com/uploads/avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256',
  },
};

const avatarRemovedExample = {
  success: true,
  statusCode: HttpStatus.OK,
  message: SYS_MSG.PROFILE_AVATAR_REMOVED_SUCCESSFULLY,
  data: {
    avatarUrl: null,
  },
};

const avatarValidationErrorExample = {
  success: false,
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  error: 'UnprocessableEntityException',
  message: SYS_MSG.PROFILE_AVATAR_UPLOAD_INVALID_TYPE,
};

// ─── Profile Endpoints ─────────────────────────────────────────────────────

export function GetProfileDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get the authenticated user\'s profile',
      description:
        'Returns the full profile for the currently authenticated user. ' +
        'Sensitive fields (password_hash, deleted_at, provider_user_id) are never included. ' +
        'Protected by JWT guard — a valid Bearer token is required.',
    }),
    ApiOkResponse({
      description: 'Profile retrieved successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PROFILE_RETRIEVED_SUCCESSFULLY,
          data: profileDataExample,
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'Profile not found',
      schema: { example: notFoundExample },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT / soft-deleted user',
      schema: { example: unauthorizedExample },
    }),
  );
}

export function UpdateProfileDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Update the authenticated user\'s profile',
      description:
        'Accepts a partial body. Only `fullName` and `country` may be changed. ' +
        '`fullName` is trimmed before validation — a whitespace-only string returns HTTP 422. ' +
        '`country` must be one of the allowed SSA countries (canonical casing). ' +
        'Sending `email` in the body returns HTTP 422. ' +
        'An empty body or unchanged values return HTTP 200 without a DB write.',
    }),
    ApiBody({ type: UpdateUserProfileDto }),
    ApiOkResponse({
      description: 'Profile updated (or unchanged) — returns current profile',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.PROFILE_UPDATED_SUCCESSFULLY,
          data: profileDataExample,
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'Validation failed — email in body / invalid country / empty fullName after trim',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.PROFILE_EMAIL_CHANGE_FORBIDDEN,
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'Profile not found',
      schema: { example: notFoundExample },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT / soft-deleted user',
      schema: { example: unauthorizedExample },
    }),
  );
}

export function UploadAvatarDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Upload authenticated user avatar',
      description:
        'Accepts multipart/form-data with a single field named `avatar`. ' +
        'MIME type is validated from file buffer using file signature detection, not extension/header. ' +
        'Allowed formats: JPEG, PNG, WebP. Maximum size: 2MB. ' +
        'Stored path is generated server-side as `avatars/{userId}/{uuid}.{ext}`. ' +
        'When a previous stored avatar exists, it is deleted before replacing.',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({ type: UploadAvatarDto }),
    ApiOkResponse({
      type: UserAvatarResponseDto,
      description: 'Avatar uploaded and profile updated successfully',
      schema: { example: avatarUploadedExample },
    }),
    ApiUnprocessableEntityResponse({
      description: 'Invalid image type, oversized image, or missing avatar file',
      schema: { example: avatarValidationErrorExample },
    }),
    ApiPayloadTooLargeResponse({
      description: 'Request body exceeded server limits before validation',
    }),
    ApiNotFoundResponse({
      description: 'Authenticated user profile was not found',
      schema: { example: notFoundExample },
    }),
    ApiInternalServerErrorResponse({
      description: 'Avatar upload failed due to storage/database failure',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'InternalServerErrorException',
          message: SYS_MSG.PROFILE_AVATAR_UPLOAD_FAILED,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT / soft-deleted user',
      schema: { example: unauthorizedExample },
    }),
  );
}

export function RemoveAvatarDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Delete authenticated user avatar',
      description:
        'Deletes current avatar object from storage when present and sets `avatar_url` to null. ' +
        'When avatar is already null, endpoint still returns HTTP 200 (no-op).',
    }),
    ApiOkResponse({
      type: UserAvatarResponseDto,
      description: 'Avatar removed successfully (or already absent)',
      schema: { example: avatarRemovedExample },
    }),
    ApiNotFoundResponse({
      description: 'Authenticated user profile was not found',
      schema: { example: notFoundExample },
    }),
    ApiInternalServerErrorResponse({
      description: 'Avatar delete failed due to storage/database failure',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'InternalServerErrorException',
          message: SYS_MSG.PROFILE_AVATAR_DELETE_FAILED,
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Missing or invalid JWT / soft-deleted user',
      schema: { example: unauthorizedExample },
    }),
  );
}

// ─── User State Endpoint ──────────────────────────────────────────────────

export function GetUserStateDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Get dashboard state for authenticated user',
      description:
        'Returns the complete app state for a returning authenticated user in a single read-only call. ' +
        'Resolves onboarding status, most recent non-failed funnel, and current active stage. ' +
        'Response is cached per-user in Redis for 20 seconds.',
    }),
    ApiOkResponse({
      description: '[Scenario 1] Onboarding complete — user has an active funnel with a stage currently in progress.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: { status: 'complete' },
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
    ApiOkResponse({
      description: '[Scenario 2] Onboarding complete — user has an active funnel but all stages are finished.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: { status: 'complete' },
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
    ApiOkResponse({
      description: '[Scenario 3] Onboarding complete — funnel is still being generated.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: { status: 'complete' },
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
    ApiOkResponse({
      description: '[Scenario 4] Onboarding complete — user has not generated a funnel yet.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: { status: 'complete' },
            activeFunnel: null,
          },
        },
      },
    }),
    ApiOkResponse({
      description: '[Scenario 5] User has an active onboarding session in progress.',
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
    ApiOkResponse({
      description: '[Scenario 6] User has never started onboarding.',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.USER_STATE_RETRIEVED,
          data: {
            onboarding: { status: 'not_started' },
            activeFunnel: null,
          },
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'No JWT token provided or token is invalid.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE,
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'JWT is valid but the userId does not match any user record.',
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

// ─── Account Deletion Endpoint (from your branch) ─────────────────────────

export function DeleteAccountDocs() {
  return applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Delete user account',
      description:
        'Soft deletes the account immediately (sets deleted_at, is_active=false, revokes all sessions). ' +
        'Schedules a hard delete job 30 days later to permanently remove all user data. ' +
        'Requires confirmation string "DELETE" (case-sensitive).',
    }),
    ApiBody({ type: DeleteAccountDto }),
    ApiOkResponse({
      description: 'Account deleted successfully',
      schema: {
        example: {
          success: true,
          statusCode: HttpStatus.OK,
          message: SYS_MSG.ACCOUNT_DELETED_SUCCESSFULLY,
          data: null,
        },
      },
    }),
    ApiUnprocessableEntityResponse({
      description: 'Invalid confirmation string',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: SYS_MSG.ACCOUNT_DELETION_CONFIRMATION_REQUIRED,
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'User not found',
    }),
    ApiUnauthorizedResponse({
      description: 'Account already deleted or unauthenticated',
    }),
  );
}

// ─── Change Password Endpoint (from dev branch) ───────────────────────────

export function ChangePasswordDocs() {
  return applyDecorators(
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
    ApiUnprocessableEntityResponse({
      description: 'New password and confirm password do not match.',
      schema: {
        example: {
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
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
}