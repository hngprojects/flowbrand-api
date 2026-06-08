import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminTeamsService } from './admin-teams.service';
import { AdminTeamModelAction } from './actions/admin-team.action';
import { TeamMembershipModelAction } from './actions/team-membership.action';
import { TeamInvitationModelAction } from './actions/team-invitation.action';
import { UserModelAction } from '../../users/actions/user.action';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UserSessionModelAction } from '../../users/actions/user-session.action';
import { RedisService } from '../../redis/redis.service';
import { AdminAuthService } from '../auth/admin-auth.service';
import { EmailService } from '../../../email/email.service';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import * as SYS_MSG from '../../../constants/system.messages';
import { TeamStatus } from './enums/team-status.enum';
import { InviteStatus } from './enums/invite-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import type { AdminTeam } from './entities/admin-team.entity';
import type { TeamInvitation } from './entities/team-invitation.entity';
import type { TeamMembership } from './entities/team-membership.entity';
import type { User } from '../../users/entities/user.entity';
import type { PaginationDto } from '../../users/dto/pagination.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeTeam = (overrides: Partial<AdminTeam> = {}): AdminTeam =>
  ({
    id: 'team-uuid-1',
    name: 'Engineering',
    description: 'Backend team',
    status: TeamStatus.ACTIVE,
    created_by: 'admin-uuid-1',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  }) as AdminTeam;

const makeInvitation = (overrides: Partial<TeamInvitation> = {}): TeamInvitation =>
  ({
    id: 'invite-uuid-1',
    team_id: 'team-uuid-1',
    email: 'member@example.com',
    role: 'admin',
    invited_by: 'admin-uuid-1',
    token_hash: 'hashed-token',
    status: InviteStatus.PENDING,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  }) as TeamInvitation;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid-1',
    full_name: 'Jane Doe',
    email: 'member@example.com',
    password_hash: 'hashed',
    is_verified: true,
    is_active: true,
    deleted_at: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  }) as User;

const makeMembership = (overrides: Partial<TeamMembership> = {}): TeamMembership =>
  ({
    id: 'membership-uuid-1',
    team_id: 'team-uuid-1',
    user_id: 'user-uuid-1',
    role: 'admin',
    joined_at: new Date('2025-01-01'),
    created_at: new Date('2025-01-01'),
    ...overrides,
  }) as TeamMembership;

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAdminTeamAction = {
  findActiveTeamsPaginated: jest.fn(),
  getTeamMemberCounts: jest.fn(),
  findActiveTeamById: jest.fn(),
  createTeam: jest.fn(),
  softDeleteTeam: jest.fn(),
};

const mockMembershipAction = {
  isUserMemberOfTeam: jest.fn(),
  createMembership: jest.fn(),
  findByTeamAndUser: jest.fn(),
  deleteMembership: jest.fn(),
};

const mockInvitationAction = {
  findPendingByEmailAndTeam: jest.fn(),
  findPendingByTeamId: jest.fn(),
  findPendingInvitationById: jest.fn(),
  createInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
  findByTokenHash: jest.fn(),
  markAccepted: jest.fn(),
};

const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockUserRoleModelAction = {
  resolveHighestRole: jest.fn(),
  create: jest.fn(),
};

const mockUserSessionModelAction = {
  revokeAllUserSessionsInDb: jest.fn(),
};

const mockRedisService = {
  delByPattern: jest.fn(),
};

const mockAdminAuthService = {
  issueTokensForInvite: jest.fn(),
};

const mockEmailService = {
  sendTeamInvite: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AdminTeamsService', () => {
  let service: AdminTeamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTeamsService,
        { provide: AdminTeamModelAction, useValue: mockAdminTeamAction },
        { provide: TeamMembershipModelAction, useValue: mockMembershipAction },
        { provide: TeamInvitationModelAction, useValue: mockInvitationAction },
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AdminAuthService, useValue: mockAdminAuthService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: PinoLoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AdminTeamsService>(AdminTeamsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const pagination: PaginationDto = { page: 1, limit: 20 };

    it('returns paginated teams with correct member counts', async () => {
      const teams = [makeTeam({ id: 'team-1' }), makeTeam({ id: 'team-2' })];
      mockAdminTeamAction.findActiveTeamsPaginated.mockResolvedValue([teams, 2]);
      mockAdminTeamAction.getTeamMemberCounts.mockResolvedValue(
        new Map([['team-1', 3], ['team-2', 1]]),
      );

      const result = await service.findAll(pagination);

      expect(mockAdminTeamAction.findActiveTeamsPaginated).toHaveBeenCalledWith(1, 20);
      expect(mockAdminTeamAction.getTeamMemberCounts).toHaveBeenCalledWith(['team-1', 'team-2']);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].member_count).toBe(3);
      expect(result.data[1].member_count).toBe(1);
    });

    it('returns correct meta pagination values', async () => {
      mockAdminTeamAction.findActiveTeamsPaginated.mockResolvedValue([[makeTeam()], 45]);
      mockAdminTeamAction.getTeamMemberCounts.mockResolvedValue(new Map());

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, total_pages: 3 });
    });

    it('defaults member_count to 0 when team has no members', async () => {
      const team = makeTeam({ id: 'team-empty' });
      mockAdminTeamAction.findActiveTeamsPaginated.mockResolvedValue([[team], 1]);
      mockAdminTeamAction.getTeamMemberCounts.mockResolvedValue(new Map());

      const result = await service.findAll(pagination);

      expect(result.data[0].member_count).toBe(0);
    });

    it('returns empty data array when no teams exist', async () => {
      mockAdminTeamAction.findActiveTeamsPaginated.mockResolvedValue([[], 0]);
      mockAdminTeamAction.getTeamMemberCounts.mockResolvedValue(new Map());

      const result = await service.findAll(pagination);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.total_pages).toBe(0);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a team and returns it', async () => {
      const dto = { name: 'Engineering', description: 'Backend team' };
      const team = makeTeam();
      mockAdminTeamAction.createTeam.mockResolvedValue(team);

      const result = await service.create(dto, 'admin-uuid-1');

      expect(mockAdminTeamAction.createTeam).toHaveBeenCalledWith(
        'Engineering',
        'Backend team',
        'admin-uuid-1',
      );
      expect(result).toEqual(team);
    });

    it('passes null description when not provided', async () => {
      const dto = { name: 'Engineering' };
      mockAdminTeamAction.createTeam.mockResolvedValue(makeTeam());

      await service.create(dto, 'admin-uuid-1');

      expect(mockAdminTeamAction.createTeam).toHaveBeenCalledWith('Engineering', null, 'admin-uuid-1');
    });

    it('logs team creation', async () => {
      const team = makeTeam();
      mockAdminTeamAction.createTeam.mockResolvedValue(team);

      await service.create({ name: 'Engineering' }, 'admin-uuid-1');

      expect(mockLogger.info).toHaveBeenCalledWith('admin.team.created', {
        teamId: team.id,
        teamName: team.name,
        createdBy: 'admin-uuid-1',
      });
    });
  });

  // ─── softDelete ───────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('soft-deletes an active team', async () => {
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(makeTeam());
      mockAdminTeamAction.softDeleteTeam.mockResolvedValue(undefined);

      await service.softDelete('team-uuid-1', 'admin-uuid-1');

      expect(mockAdminTeamAction.softDeleteTeam).toHaveBeenCalledWith('team-uuid-1');
    });

    it('throws NotFoundException when team does not exist', async () => {
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(null);

      await expect(service.softDelete('non-existent', 'admin-uuid-1')).rejects.toThrow(
        new NotFoundException(SYS_MSG.TEAM_NOT_FOUND),
      );
      expect(mockAdminTeamAction.softDeleteTeam).not.toHaveBeenCalled();
    });

    it('logs soft deletion with team name and actor', async () => {
      const team = makeTeam();
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(team);
      mockAdminTeamAction.softDeleteTeam.mockResolvedValue(undefined);

      await service.softDelete('team-uuid-1', 'admin-uuid-1');

      expect(mockLogger.info).toHaveBeenCalledWith('admin.team.soft_deleted', {
        teamId: 'team-uuid-1',
        teamName: team.name,
        deletedBy: 'admin-uuid-1',
      });
    });
  });

  // ─── inviteMembers ────────────────────────────────────────────────────────

  describe('inviteMembers', () => {
    const teamId = 'team-uuid-1';
    const invitedBy = 'admin-uuid-1';
    const dto = { emails: ['a@example.com', 'b@example.com'], role: 'member' };

    beforeEach(() => {
      process.env.FRONTEND_URL = 'https://app.seil.io';
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(makeTeam());
      mockInvitationAction.findPendingByEmailAndTeam.mockResolvedValue(null);
      mockMembershipAction.isUserMemberOfTeam.mockResolvedValue(false);
      mockInvitationAction.createInvitation.mockResolvedValue(makeInvitation());
      mockEmailService.sendTeamInvite.mockResolvedValue('job-123');
    });

    afterEach(() => { delete process.env.FRONTEND_URL; });

    it('throws NotFoundException when team does not exist', async () => {
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(null);

      await expect(service.inviteMembers(teamId, dto, invitedBy)).rejects.toThrow(
        new NotFoundException(SYS_MSG.TEAM_NOT_FOUND),
      );
    });

    it('sends invites to all valid emails and returns correct counts', async () => {
      const result = await service.inviteMembers(teamId, dto, invitedBy);

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockEmailService.sendTeamInvite).toHaveBeenCalledTimes(2);
    });

    it('fails with correct reason when pending invite already exists — AC-05', async () => {
      mockInvitationAction.findPendingByEmailAndTeam.mockResolvedValue(makeInvitation());

      const result = await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toBe(SYS_MSG.TEAM_INVITE_ALREADY_PENDING);
      expect(mockInvitationAction.createInvitation).not.toHaveBeenCalled();
      expect(mockEmailService.sendTeamInvite).not.toHaveBeenCalled();
    });

    it('fails with correct reason when user is already a member — AC-06 / EC-01', async () => {
      mockMembershipAction.isUserMemberOfTeam.mockResolvedValue(true);

      const result = await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toBe(SYS_MSG.TEAM_ALREADY_MEMBER);
      expect(mockInvitationAction.createInvitation).not.toHaveBeenCalled();
    });

    it('processes remaining emails when some fail — EC-03 batch independence', async () => {
      mockInvitationAction.findPendingByEmailAndTeam
        .mockResolvedValueOnce(makeInvitation())
        .mockResolvedValueOnce(null);

      const result = await service.inviteMembers(teamId, dto, invitedBy);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].email).toBe('a@example.com');
      expect(mockEmailService.sendTeamInvite).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendTeamInvite).toHaveBeenCalledWith('b@example.com', expect.any(Object));
    });

    it('catches email dispatch errors and marks that email as failed without aborting batch — EC-03', async () => {
      mockEmailService.sendTeamInvite
        .mockRejectedValueOnce(new Error('SMTP timeout'))
        .mockResolvedValueOnce(undefined);

      const result = await service.inviteMembers(teamId, dto, invitedBy);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toBe('Internal error');
    });

    it('stores SHA-256 hash — never the raw token — SEC-02', async () => {
      await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      const [, , , , tokenHash] = mockInvitationAction.createInvitation.mock.calls[0];
      const [, payload] = mockEmailService.sendTeamInvite.mock.calls[0];
      const url = new URL(payload.inviteLink);
      const rawToken = url.searchParams.get('token')!;
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      expect(tokenHash).toBe(expectedHash);
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('builds invite link from FRONTEND_URL env — SEC-03', async () => {
      await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      const [, payload] = mockEmailService.sendTeamInvite.mock.calls[0];
      expect(payload.inviteLink).toMatch(/^https:\/\/app\.seil\.io\/accept-invite\?token=[a-f0-9]{64}$/);
    });

    it('sets expiry 7 days from now', async () => {
      const before = new Date();

      await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      const [, , , , , expiresAt] = mockInvitationAction.createInvitation.mock.calls[0];
      const expected = new Date(before);
      expected.setDate(expected.getDate() + 7);

      expect(expiresAt.getDate()).toBe(expected.getDate());
      expect(expiresAt.getMonth()).toBe(expected.getMonth());
      expect(expiresAt.getFullYear()).toBe(expected.getFullYear());
    });

    it('logs completion summary', async () => {
      await service.inviteMembers(teamId, dto, invitedBy);

      expect(mockLogger.info).toHaveBeenCalledWith('admin.team.invites.completed', {
        teamId,
        invitedBy,
        sent: 2,
        failed: 0,
      });
    });

    it('logs per-email error without aborting batch', async () => {
      mockEmailService.sendTeamInvite.mockRejectedValueOnce(new Error('SMTP timeout'));

      await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      expect(mockLogger.error).toHaveBeenCalledWith('admin.team.invite_failed', {
        teamId,
        email: 'a@example.com',
        error: 'SMTP timeout',
      });
    });
  });

  // ─── getInvitations ───────────────────────────────────────────────────────

  describe('getInvitations', () => {
    it('returns pending invitations for a team', async () => {
      const invitations = [makeInvitation(), makeInvitation({ id: 'invite-uuid-2', email: 'other@example.com' })];
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(makeTeam());
      mockInvitationAction.findPendingByTeamId.mockResolvedValue(invitations);

      const result = await service.getInvitations('team-uuid-1');

      expect(mockInvitationAction.findPendingByTeamId).toHaveBeenCalledWith('team-uuid-1');
      expect(result).toEqual(invitations);
    });

    it('throws NotFoundException when team does not exist', async () => {
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(null);

      await expect(service.getInvitations('non-existent')).rejects.toThrow(
        new NotFoundException(SYS_MSG.TEAM_NOT_FOUND),
      );
      expect(mockInvitationAction.findPendingByTeamId).not.toHaveBeenCalled();
    });
  });

  // ─── revokeInvitation ─────────────────────────────────────────────────────

  describe('revokeInvitation', () => {
    it('revokes a pending invitation', async () => {
      mockInvitationAction.findPendingInvitationById.mockResolvedValue(makeInvitation());
      mockInvitationAction.revokeInvitation.mockResolvedValue(undefined);

      await service.revokeInvitation('team-uuid-1', 'invite-uuid-1');

      expect(mockInvitationAction.revokeInvitation).toHaveBeenCalledWith('invite-uuid-1');
    });

    it('throws NotFoundException when invitation does not exist or is not pending', async () => {
      mockInvitationAction.findPendingInvitationById.mockResolvedValue(null);

      await expect(service.revokeInvitation('team-uuid-1', 'non-existent')).rejects.toThrow(
        new NotFoundException(SYS_MSG.TEAM_INVITATION_NOT_FOUND),
      );
      expect(mockInvitationAction.revokeInvitation).not.toHaveBeenCalled();
    });

    it('logs revocation with email, teamId, and inviteId', async () => {
      const invite = makeInvitation();
      mockInvitationAction.findPendingInvitationById.mockResolvedValue(invite);
      mockInvitationAction.revokeInvitation.mockResolvedValue(undefined);

      await service.revokeInvitation('team-uuid-1', 'invite-uuid-1');

      expect(mockLogger.info).toHaveBeenCalledWith('admin.team.invite.revoked', {
        teamId: 'team-uuid-1',
        inviteId: 'invite-uuid-1',
        email: invite.email,
      });
    });
  });

  // ─── acceptInvite (FR-1) ──────────────────────────────────────────────────

  describe('acceptInvite', () => {
    const dto = {
      token: 'raw-token-64-chars-hex',
      full_name: 'Jane Doe',
      password: 'SecurePass1!',
    };

    // Compute what the service will hash from dto.token
    const expectedHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    beforeEach(() => {
      mockInvitationAction.findByTokenHash.mockResolvedValue(makeInvitation());
      mockUserModelAction.findByEmail.mockResolvedValue(null); // new user by default
      mockUserModelAction.create.mockResolvedValue(makeUser());
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(null);
      mockUserRoleModelAction.create.mockResolvedValue(undefined);
      mockMembershipAction.createMembership.mockResolvedValue(makeMembership());
      mockInvitationAction.markAccepted.mockResolvedValue(undefined);
      mockAdminAuthService.issueTokensForInvite.mockResolvedValue({
        accessToken: 'jwt-access-token',
        refreshToken: 'jwt-refresh-token',
      });
    });

    // ── Token validation ────────────────────────────────────────────────────

    it('hashes the incoming token with SHA-256 before looking up the invitation', async () => {
      await service.acceptInvite(dto);

      expect(mockInvitationAction.findByTokenHash).toHaveBeenCalledWith(expectedHash);
    });

    it('throws BadRequestException when token is not found — AC-01 / invalid', async () => {
      mockInvitationAction.findByTokenHash.mockResolvedValue(null);

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        new BadRequestException(SYS_MSG.INVITE_TOKEN_INVALID),
      );
    });

    it('throws BadRequestException when invitation is already accepted — AC-03 / EC-03', async () => {
      mockInvitationAction.findByTokenHash.mockResolvedValue(
        makeInvitation({ status: InviteStatus.ACCEPTED }),
      );

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        new BadRequestException(SYS_MSG.INVITE_ALREADY_USED),
      );
    });

    it('throws BadRequestException when invitation is revoked', async () => {
      mockInvitationAction.findByTokenHash.mockResolvedValue(
        makeInvitation({ status: InviteStatus.REVOKED }),
      );

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        new BadRequestException(SYS_MSG.INVITE_ALREADY_USED),
      );
    });

    it('throws BadRequestException when invitation is expired — AC-02', async () => {
      mockInvitationAction.findByTokenHash.mockResolvedValue(
        makeInvitation({ expires_at: new Date('2020-01-01') }), // past date
      );

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        new BadRequestException(SYS_MSG.INVITE_EXPIRED),
      );
    });

    it('does not proceed to account creation when token is invalid', async () => {
      mockInvitationAction.findByTokenHash.mockResolvedValue(null);

      await expect(service.acceptInvite(dto)).rejects.toThrow();

      expect(mockUserModelAction.findByEmail).not.toHaveBeenCalled();
      expect(mockUserModelAction.create).not.toHaveBeenCalled();
      expect(mockMembershipAction.createMembership).not.toHaveBeenCalled();
    });

    // ── New user creation ───────────────────────────────────────────────────

    it('creates a new user when no account exists for the invite email — AC-01', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      await service.acceptInvite(dto);

      expect(mockUserModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: expect.objectContaining({
            email: 'member@example.com',
            full_name: 'Jane Doe',
            is_verified: true,
            is_active: true,
            termsAccepted: true,
          }),
        }),
      );
    });

    it('sets is_verified=true on created user — invited users skip OTP', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      await service.acceptInvite(dto);

      const [createArg] = mockUserModelAction.create.mock.calls[0];
      expect(createArg.createPayload.is_verified).toBe(true);
    });

    it('hashes the password with bcrypt 12 rounds — SEC-02', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      await service.acceptInvite(dto);

      const [createArg] = mockUserModelAction.create.mock.calls[0];
      const storedHash = createArg.createPayload.password_hash;

      // bcrypt hash format: $2b$12$...
      expect(storedHash).toMatch(/^\$2b\$12\$/);
    });

    it('does not store the raw password in the DB', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      await service.acceptInvite(dto);

      const [createArg] = mockUserModelAction.create.mock.calls[0];
      expect(createArg.createPayload.password_hash).not.toBe(dto.password);
    });

    // ── Existing user linking ───────────────────────────────────────────────

    it('links invite to existing account without creating a duplicate — AC-04 / EC-01', async () => {
      const existingUser = makeUser();
      mockUserModelAction.findByEmail.mockResolvedValue(existingUser);

      await service.acceptInvite(dto);

      expect(mockUserModelAction.create).not.toHaveBeenCalled();
      expect(mockMembershipAction.createMembership).toHaveBeenCalledWith(
        'team-uuid-1',
        existingUser.id,
        expect.any(String),
      );
    });

    // ── Role assignment ─────────────────────────────────────────────────────

    it('assigns invite role when user has no current role', async () => {
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(null);

      await service.acceptInvite(dto);

      expect(mockUserRoleModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: expect.objectContaining({
            user_id: 'user-uuid-1',
            role: 'admin', // invitation.role from makeInvitation()
          }),
        }),
      );
    });

    it('upgrades role when invite grants a higher role than current', async () => {
      // User currently has USER role, invite grants ADMIN
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.USER);
      mockInvitationAction.findByTokenHash.mockResolvedValue(
        makeInvitation({ role: UserRole.ADMIN }),
      );

      await service.acceptInvite(dto);

      expect(mockUserRoleModelAction.create).toHaveBeenCalled();
    });

    it('does not assign role when user already has an equal or higher role', async () => {
      // User already has ADMIN, invite also grants ADMIN — no-op
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);
      mockInvitationAction.findByTokenHash.mockResolvedValue(
        makeInvitation({ role: UserRole.ADMIN }),
      );

      await service.acceptInvite(dto);

      expect(mockUserRoleModelAction.create).not.toHaveBeenCalled();
    });

    it('does not assign role when user has a higher role than the invite', async () => {
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.SUPER_ADMIN);
      mockInvitationAction.findByTokenHash.mockResolvedValue(
        makeInvitation({ role: UserRole.ADMIN }),
      );

      await service.acceptInvite(dto);

      expect(mockUserRoleModelAction.create).not.toHaveBeenCalled();
    });

    // ── Team membership & invitation state ──────────────────────────────────

    it('inserts team membership with correct team_id, user_id, and role', async () => {
      await service.acceptInvite(dto);

      expect(mockMembershipAction.createMembership).toHaveBeenCalledWith(
        'team-uuid-1',
        'user-uuid-1',
        'admin', // role from makeInvitation()
      );
    });

    it('marks the invitation as accepted after all steps complete', async () => {
      await service.acceptInvite(dto);

      expect(mockInvitationAction.markAccepted).toHaveBeenCalledWith('invite-uuid-1');
    });

    it('does not mark invitation accepted when user creation fails', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockRejectedValue(new Error('DB error'));

      await expect(service.acceptInvite(dto)).rejects.toThrow();

      expect(mockInvitationAction.markAccepted).not.toHaveBeenCalled();
    });

    // ── JWT issuance ────────────────────────────────────────────────────────

    it('issues JWT via AdminAuthService with correct userId, email, and role', async () => {
      await service.acceptInvite(dto);

      expect(mockAdminAuthService.issueTokensForInvite).toHaveBeenCalledWith(
        'user-uuid-1',
        'member@example.com',
        'admin', // invitation.role
      );
    });

    it('returns accessToken and user shape on success — AC-01', async () => {
      const result = await service.acceptInvite(dto);

      expect(result).toEqual({
        accessToken: 'jwt-access-token',
        user: {
          id: 'user-uuid-1',
          full_name: 'Jane Doe',
          email: 'member@example.com',
          role: 'admin',
        },
      });
    });

    it('logs successful acceptance', async () => {
      await service.acceptInvite(dto);

      expect(mockLogger.info).toHaveBeenCalledWith('admin.team.invite.accepted', {
        userId: 'user-uuid-1',
        teamId: 'team-uuid-1',
        inviteId: 'invite-uuid-1',
      });
    });
  });

  // ─── revokeMember (FR-2) ──────────────────────────────────────────────────

  describe('revokeMember', () => {
    const teamId = 'team-uuid-1';
    const memberId = 'user-uuid-1';
    const requestingUserId = 'admin-uuid-99';

    beforeEach(() => {
      mockMembershipAction.findByTeamAndUser.mockResolvedValue(makeMembership());
      mockMembershipAction.deleteMembership.mockResolvedValue(undefined);
      mockUserSessionModelAction.revokeAllUserSessionsInDb.mockResolvedValue(['sess-1', 'sess-2']);
      mockUserModelAction.update.mockResolvedValue(makeUser({ is_active: false }));
      mockRedisService.delByPattern.mockResolvedValue(undefined);
    });

    // ── Self-revoke guard ───────────────────────────────────────────────────

    it('throws ForbiddenException when admin attempts to revoke own access — AC-07 / EC-02', async () => {
      await expect(
        service.revokeMember(teamId, 'admin-uuid-99', 'admin-uuid-99'),
      ).rejects.toThrow(new ForbiddenException(SYS_MSG.MEMBER_REVOKE_SELF_FORBIDDEN));
    });

    it('does not touch DB when self-revocation is attempted', async () => {
      await expect(
        service.revokeMember(teamId, 'admin-uuid-99', 'admin-uuid-99'),
      ).rejects.toThrow();

      expect(mockMembershipAction.findByTeamAndUser).not.toHaveBeenCalled();
      expect(mockMembershipAction.deleteMembership).not.toHaveBeenCalled();
    });

    // ── Member not found ────────────────────────────────────────────────────

    it('throws NotFoundException when membership does not exist', async () => {
      mockMembershipAction.findByTeamAndUser.mockResolvedValue(null);

      await expect(service.revokeMember(teamId, memberId, requestingUserId)).rejects.toThrow(
        new NotFoundException(SYS_MSG.MEMBER_NOT_FOUND),
      );
    });

    it('does not revoke sessions when membership is not found', async () => {
      mockMembershipAction.findByTeamAndUser.mockResolvedValue(null);

      await expect(service.revokeMember(teamId, memberId, requestingUserId)).rejects.toThrow();

      expect(mockUserSessionModelAction.revokeAllUserSessionsInDb).not.toHaveBeenCalled();
    });

    // ── Happy path — full revocation ────────────────────────────────────────

    it('hard-deletes the membership row — AC-05', async () => {
      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(mockMembershipAction.deleteMembership).toHaveBeenCalledWith(teamId, memberId);
    });

    it('revokes all DB sessions for the member — AC-05', async () => {
      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(mockUserSessionModelAction.revokeAllUserSessionsInDb).toHaveBeenCalledWith(memberId);
    });

    it('deactivates the user account', async () => {
      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(mockUserModelAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          identifierOptions: { id: memberId },
          updatePayload: { is_active: false },
        }),
      );
    });

    it('purges Redis sessions so next API call returns 401 immediately — AC-06 / SEC-03', async () => {
      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(mockRedisService.delByPattern).toHaveBeenCalledWith(`sess:${memberId}:*`);
    });

    it('skips Redis purge when user had no active sessions', async () => {
      mockUserSessionModelAction.revokeAllUserSessionsInDb.mockResolvedValue([]);

      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(mockRedisService.delByPattern).not.toHaveBeenCalled();
    });

    it('logs revocation with session count', async () => {
      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(mockLogger.info).toHaveBeenCalledWith('admin.team.member.revoked', {
        teamId,
        memberId,
        revokedBy: requestingUserId,
        sessionsRevoked: 2,
      });
    });

    it('completes all revocation steps before returning — SEC-03 synchronous guarantee', async () => {
      const callOrder: string[] = [];

      mockMembershipAction.deleteMembership.mockImplementation(async () => {
        callOrder.push('deleteMembership');
      });
      mockUserSessionModelAction.revokeAllUserSessionsInDb.mockImplementation(async () => {
        callOrder.push('revokeAllUserSessionsInDb');
        return ['sess-1'];
      });
      mockUserModelAction.update.mockImplementation(async () => {
        callOrder.push('userUpdate');
        return makeUser({ is_active: false });
      });
      mockRedisService.delByPattern.mockImplementation(async () => {
        callOrder.push('delByPattern');
      });

      await service.revokeMember(teamId, memberId, requestingUserId);

      expect(callOrder).toEqual([
        'deleteMembership',
        'revokeAllUserSessionsInDb',
        'userUpdate',
        'delByPattern',
      ]);
    });
  });
});