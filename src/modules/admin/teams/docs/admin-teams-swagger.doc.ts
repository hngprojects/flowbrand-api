import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateTeamDto } from '../dto/create-team.dto';
import { InviteMembersDto } from '../dto/invite-members.dto';
import * as SYS_MSG from '../../../../constants/system.messages';

export const GetTeamsDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'List all active teams',
      description: 'Returns a paginated list of all active teams with member counts.',
    }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 20 }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.TEAMS_RETRIEVED_SUCCESSFULLY,
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.TEAMS_RETRIEVED_SUCCESSFULLY,
          data: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              name: 'Engineering',
              description: 'Backend team',
              status: 'active',
              created_at: '2025-01-01T00:00:00.000Z',
              member_count: 4,
            },
          ],
          meta: {
            total: 10,
            page: 1,
            limit: 20,
            total_pages: 1,
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const CreateTeamDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Create a new team',
      description: 'Creates a new admin team. The authenticated admin becomes the creator.',
    }),
    ApiBody({ type: CreateTeamDto }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: SYS_MSG.TEAM_CREATED_SUCCESSFULLY,
      schema: {
        example: {
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.TEAM_CREATED_SUCCESSFULLY,
          data: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Engineering',
            description: 'Backend team',
            status: 'active',
            created_by: '550e8400-e29b-41d4-a716-446655440001',
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const DeleteTeamDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Soft-delete a team',
      description:
        'Sets the team status to "deleted". Does not hard delete or revoke active member sessions.',
    }),
    ApiParam({ name: 'teamId', type: String, format: 'uuid' }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.TEAM_DELETED_SUCCESSFULLY,
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.TEAM_DELETED_SUCCESSFULLY,
          data: { success: true },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: SYS_MSG.TEAM_NOT_FOUND }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const InviteMembersDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Invite members to a team',
      description:
        'Sends invite emails to 1–20 addresses. Each email is processed independently. ' +
        'Returns a summary of sent and failed invites.',
    }),
    ApiParam({ name: 'teamId', type: String, format: 'uuid' }),
    ApiBody({ type: InviteMembersDto }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.TEAM_INVITES_DISPATCHED,
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.TEAM_INVITES_DISPATCHED,
          data: {
            sent: 18,
            failed: 2,
            errors: [
              { email: 'a@example.com', status: 'failed', reason: SYS_MSG.TEAM_INVITE_ALREADY_PENDING },
              { email: 'b@example.com', status: 'failed', reason: SYS_MSG.TEAM_ALREADY_MEMBER },
            ],
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: SYS_MSG.TEAM_INVITE_ALREADY_PENDING,
      schema: {
        example: {
          statusCode: HttpStatus.CONFLICT,
          message: SYS_MSG.TEAM_INVITE_ALREADY_PENDING,
          error: 'ConflictException',
        },
      },
    }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: SYS_MSG.TEAM_NOT_FOUND }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const GetInvitationsDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'List pending invitations for a team',
      description: 'Returns all pending (not accepted or revoked) invitations for the given team.',
    }),
    ApiParam({ name: 'teamId', type: String, format: 'uuid' }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.TEAM_INVITATIONS_RETRIEVED,
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.TEAM_INVITATIONS_RETRIEVED,
          data: [
            {
              id: '550e8400-e29b-41d4-a716-446655440002',
              email: 'member@example.com',
              role: 'editor',
              expires_at: '2025-01-08T00:00:00.000Z',
              created_at: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: SYS_MSG.TEAM_NOT_FOUND }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const RevokeInvitationDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Revoke a pending invitation',
      description:
        'Sets the invitation status to "revoked". The token can no longer be used to accept the invite.',
    }),
    ApiParam({ name: 'teamId', type: String, format: 'uuid' }),
    ApiParam({ name: 'inviteId', type: String, format: 'uuid' }),
    ApiResponse({
      status: HttpStatus.OK,
      description: SYS_MSG.TEAM_INVITATION_REVOKED,
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.TEAM_INVITATION_REVOKED,
          data: { success: true },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: SYS_MSG.TEAM_INVITATION_NOT_FOUND }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const AcceptInviteDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Accept a team invitation',
      description:
        'Public endpoint — no JWT required. ' +
        'Validates the invite token, creates or links a user account, ' +
        'adds the user to the team, and returns a JWT for immediate login. ' +
        'Returns HTTP 400 for invalid, expired, or already-used tokens.',
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Invitation accepted — JWT issued for immediate login',
      schema: {
        example: {
          statusCode: HttpStatus.CREATED,
          message: SYS_MSG.INVITE_ACCEPTED_SUCCESSFULLY,
          data: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              full_name: 'Jane Doe',
              email: 'jane@example.com',
              role: 'admin',
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: SYS_MSG.INVITE_EXPIRED,
      schema: {
        examples: {
          invalid: {
            value: {
              statusCode: HttpStatus.BAD_REQUEST,
              message: SYS_MSG.INVITE_EXPIRED,
            },
          },
          expired: {
            value: {
              statusCode: HttpStatus.BAD_REQUEST,
              message: SYS_MSG.INVITE_EXPIRED,
            },
          },
          used: {
            value: {
              statusCode: HttpStatus.BAD_REQUEST,
              message: SYS_MSG.INVITE_ALREADY_USED,
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: SYS_MSG.PASSWORD_VALIDATION_FAILED,
      schema: {
        example: {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: SYS_MSG.PASSWORD_VALIDATION_FAILED,
          error: 'UnprocessableEntityException',
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' }),
  );

export const RevokeMemberDocs = () =>
  applyDecorators(
    ApiBearerAuth('JWT'),
    ApiOperation({
      summary: 'Revoke a team member\'s access',
      description:
        'Removes the member from the team, invalidates all their active sessions immediately, ' +
        'and deactivates their account. Admins cannot revoke their own access.',
    }),
    ApiParam({ name: 'teamId', type: String, format: 'uuid', description: 'Team ID' }),
    ApiParam({ name: 'memberId', type: String, format: 'uuid', description: 'Member user ID to revoke' }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Member access revoked — sessions invalidated immediately',
      schema: {
        example: {
          statusCode: HttpStatus.OK,
          message: SYS_MSG.MEMBER_REVOKED_SUCCESSFULLY,
          data: { success: true },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'Team member not found',
      schema: {
        example: {
          statusCode: HttpStatus.NOT_FOUND,
          message: SYS_MSG.MEMBER_NOT_FOUND,
          error: 'NotFoundException',
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Cannot revoke your own access — EC-02 / AC-07',
      schema: {
        example: {
          statusCode: HttpStatus.FORBIDDEN,
          message: SYS_MSG.MEMBER_REVOKE_SELF_FORBIDDEN,
          error: 'ForbiddenException',
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthenticated — valid JWT required' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied — insufficient permissions' }),
  );