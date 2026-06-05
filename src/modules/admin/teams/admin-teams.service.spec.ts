import * as crypto from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminTeamsService } from './admin-teams.service';
import { AdminTeamModelAction } from './actions/admin-team.action';
import { TeamMembershipModelAction } from './actions/team-membership.action';
import { TeamInvitationModelAction } from './actions/team-invitation.action';
import { EmailService } from '../../../email/email.service';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import * as SYS_MSG from '../../../constants/system.messages';
import { TeamStatus } from './enums/team-status.enum';
import { InviteStatus } from './enums/invite-status.enum';
import type { AdminTeam } from './entities/admin-team.entity';
import type { TeamInvitation } from './entities/team-invitation.entity';
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
    role: 'member',
    invited_by: 'admin-uuid-1',
    token_hash: 'hashed-token',
    status: InviteStatus.PENDING,
    expires_at: new Date('2025-01-08'),
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  }) as TeamInvitation;

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
};

const mockInvitationAction = {
  findPendingByEmailAndTeam: jest.fn(),
  findPendingByTeamId: jest.fn(),
  findPendingInvitationById: jest.fn(),
  createInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
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

      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        total_pages: 3,
      });
    });

    it('defaults member_count to 0 when team has no members', async () => {
      const team = makeTeam({ id: 'team-empty' });
      mockAdminTeamAction.findActiveTeamsPaginated.mockResolvedValue([[team], 1]);
      mockAdminTeamAction.getTeamMemberCounts.mockResolvedValue(new Map()); // no entry for this team

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

      expect(mockAdminTeamAction.createTeam).toHaveBeenCalledWith(
        'Engineering',
        null,
        'admin-uuid-1',
      );
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
      const team = makeTeam();
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(team);
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
      mockAdminTeamAction.findActiveTeamById.mockResolvedValue(makeTeam());
      mockInvitationAction.findPendingByEmailAndTeam.mockResolvedValue(null);
      mockMembershipAction.isUserMemberOfTeam.mockResolvedValue(false);
      mockInvitationAction.createInvitation.mockResolvedValue(makeInvitation());
      mockEmailService.sendTeamInvite.mockResolvedValue('job-123');
    });

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
      // first email has a pending invite, second is clean
      mockInvitationAction.findPendingByEmailAndTeam
        .mockResolvedValueOnce(makeInvitation())  // a@example.com fails
        .mockResolvedValueOnce(null);             // b@example.com passes

      const result = await service.inviteMembers(teamId, dto, invitedBy);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].email).toBe('a@example.com');
      expect(mockEmailService.sendTeamInvite).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendTeamInvite).toHaveBeenCalledWith('b@example.com', expect.any(Object));
    });

    it('catches email dispatch errors and marks that email as failed without aborting batch — EC-03', async () => {
      mockEmailService.sendTeamInvite
        .mockRejectedValueOnce(new Error('SMTP timeout'))  // a@example.com throws
        .mockResolvedValueOnce(undefined);                 // b@example.com succeeds

      const result = await service.inviteMembers(teamId, dto, invitedBy);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toBe('Internal error');
    });

    it('stores SHA-256 hash — never the raw token — SEC-02', async () => {
      await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      const [, , , , tokenHash] = mockInvitationAction.createInvitation.mock.calls[0];
      const [, payload] = mockEmailService.sendTeamInvite.mock.calls[0];
      const rawToken = new URL(payload.inviteLink).searchParams.get('token')!;
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

       expect(tokenHash).toBe(expectedHash);
       expect(tokenHash).not.toBe(rawToken);
    });

    it('builds invite link from APP_URL env — SEC-03', async () => {
      process.env.APP_URL = 'https://app.seil.io';

      await service.inviteMembers(teamId, { emails: ['a@example.com'], role: 'member' }, invitedBy);

      const [, payload] = mockEmailService.sendTeamInvite.mock.calls[0];
      expect(payload.inviteLink).toMatch(/^https:\/\/app\.seil\.io\/accept-invite\?token=[a-f0-9]{64}$/);

      delete process.env.APP_URL;
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
      const invite = makeInvitation();
      mockInvitationAction.findPendingInvitationById.mockResolvedValue(invite);
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
});