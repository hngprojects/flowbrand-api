import {
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UserRole } from '../../../users/enums/user-role.enum';
import { AdminProfileModelAction } from '../actions/admin-profile.action';
import { AdminProfileService } from '../admin-profile.service';
import { AdminProfileActionType } from '../enums/admin-profile-action-type.enum';
import { LogService } from '../services/log.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const mockAdminProfileAction = {
  findById: jest.fn(),
  updateProfile: jest.fn(),
  updatePasswordHash: jest.fn(),
  revokeAllSessions: jest.fn(),
};

const mockUserRoleModelAction = {
  resolveHighestRole: jest.fn(),
};

const mockLogService = {
  logAction: jest.fn(),
};

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ADMIN_USER = {
  id: ADMIN_ID,
  full_name: 'Jane Admin',
  email: 'admin@example.com',
  country: 'Nigeria',
  avatar_url: null,
  password_hash: 'hashed-secret',
  created_at: new Date('2026-05-29T10:30:00.000Z'),
};

describe('AdminProfileService', () => {
  let service: AdminProfileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(UserRole.ADMIN);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProfileService,
        { provide: AdminProfileModelAction, useValue: mockAdminProfileAction },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
        { provide: LogService, useValue: mockLogService },
      ],
    }).compile();

    service = module.get<AdminProfileService>(AdminProfileService);
  });

  describe('getProfile', () => {
    it('AC-01: returns admin profile with role and created_at', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      const result = await service.getProfile(ADMIN_ID);

      expect(result).toEqual({
        id: ADMIN_ID,
        full_name: 'Jane Admin',
        email: 'admin@example.com',
        country: 'Nigeria',
        avatar_url: null,
        role: UserRole.ADMIN,
        created_at: ADMIN_USER.created_at,
      });
    });

    it('SEC-01: excludes password_hash from returned profile', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      const result = await service.getProfile(ADMIN_ID) as unknown as Record<string, unknown>;

      expect(result).not.toHaveProperty('password_hash');
    });

    it('throws 404 when admin row does not exist', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(null);

      await expect(service.getProfile(ADMIN_ID)).rejects.toThrow(
        new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND),
      );
    });
  });

  describe('updateProfile', () => {
    it('AC-03 / SEC-02: throws 422 when email appears in request body', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      await expect(
        service.updateProfile(ADMIN_ID, { email: 'other@example.com' }),
      ).rejects.toThrow(new UnprocessableEntityException(SYS_MSG.ADMIN_PROFILE_EMAIL_CHANGE_FORBIDDEN));

      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
    });

    it('AC-05: empty body returns current profile and skips DB write', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      const result = await service.updateProfile(ADMIN_ID, {});

      expect(result.full_name).toBe('Jane Admin');
      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });

    it('EC-01: no-change full_name returns current profile without DB write', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      const result = await service.updateProfile(ADMIN_ID, { full_name: 'Jane Admin' });

      expect(result.full_name).toBe('Jane Admin');
      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });

    it('EC-01: no-change country returns current profile without DB write', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      await service.updateProfile(ADMIN_ID, { country: 'Nigeria' });

      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });

    it('AC-02: updates full_name and logs action_type=profile_updated', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue({
        ...ADMIN_USER,
        full_name: 'Jane Updated',
      });

      const result = await service.updateProfile(ADMIN_ID, { full_name: 'Jane Updated' });

      expect(result.full_name).toBe('Jane Updated');
      expect(mockAdminProfileAction.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {
        full_name: 'Jane Updated',
      });
      expect(mockLogService.logAction).toHaveBeenCalledWith({
        admin_id: ADMIN_ID,
        action_type: AdminProfileActionType.PROFILE_UPDATED,
        status: 'success',
        metadata: { updated_fields: ['full_name'] },
      });
    });

    it('AC-02 / EC-03: partial country update only updates country field', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue({
        ...ADMIN_USER,
        country: 'Ghana',
      });

      const result = await service.updateProfile(ADMIN_ID, { country: 'Ghana' });

      expect(result.country).toBe('Ghana');
      expect(mockAdminProfileAction.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {
        country: 'Ghana',
      });
      const updatePayload = mockAdminProfileAction.updateProfile.mock.calls[0][1] as Record<string, unknown>;
      expect(updatePayload).not.toHaveProperty('full_name');
    });

    it('updates both full_name and country in one request', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue({
        ...ADMIN_USER,
        full_name: 'Jane Updated',
        country: 'Ghana',
      });

      const result = await service.updateProfile(ADMIN_ID, {
        full_name: 'Jane Updated',
        country: 'Ghana',
      });

      expect(result.full_name).toBe('Jane Updated');
      expect(result.country).toBe('Ghana');
      expect(mockLogService.logAction).toHaveBeenCalledWith({
        admin_id: ADMIN_ID,
        action_type: AdminProfileActionType.PROFILE_UPDATED,
        status: 'success',
        metadata: { updated_fields: ['full_name', 'country'] },
      });
    });

    it('throws 404 when admin cannot be found before update', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(null);

      await expect(service.updateProfile(ADMIN_ID, { full_name: 'Different Name' })).rejects.toThrow(
        new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND),
      );
    });

    it('throws 500 when DB returns null on update', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue(null);

      await expect(service.updateProfile(ADMIN_ID, { full_name: 'Different Name' })).rejects.toThrow(
        new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_UPDATE_FAILED),
      );
    });

    it('throws 404 when admin role cannot be resolved', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockResolvedValue(null);

      await expect(service.updateProfile(ADMIN_ID, {})).rejects.toThrow(
        new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_RESPONSE_ROLE_RESOLUTION_FAILED),
      );
    });
  });

  describe('changePassword', () => {
    const dto = {
      old_password: 'CurrentAdmin@123',
      new_password: 'NewAdmin!789',
      confirm_password: 'NewAdmin!789',
    };

    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updatePasswordHash.mockResolvedValue({
        ...ADMIN_USER,
        password_hash: 'new-hash',
      });
      mockAdminProfileAction.revokeAllSessions.mockResolvedValue(2);
    });

    it('AC-01: returns successfully for correct old password and valid new password', async () => {
      await expect(service.changePassword(ADMIN_ID, dto)).resolves.toBeUndefined();

      expect(bcrypt.compare).toHaveBeenCalledWith(dto.old_password, ADMIN_USER.password_hash);
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.new_password, 12);
      expect(mockAdminProfileAction.updatePasswordHash).toHaveBeenCalledWith(ADMIN_ID, 'new-hash');
      expect(mockAdminProfileAction.revokeAllSessions).toHaveBeenCalledWith(ADMIN_ID);
      expect(mockLogService.logAction).toHaveBeenCalledWith({
        admin_id: ADMIN_ID,
        action_type: AdminProfileActionType.PASSWORD_CHANGED,
        status: 'success',
        metadata: { fields_changed: ['password'] },
      });
    });

    it('AC-02: throws HTTP 401 when old password is incorrect', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(ADMIN_ID, dto)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.ADMIN_OLD_PASSWORD_INCORRECT),
      );

      expect(mockAdminProfileAction.updatePasswordHash).not.toHaveBeenCalled();
      expect(mockAdminProfileAction.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('AC-05 / EC-01: throws HTTP 422 when new_password is the same as old_password', async () => {
      await expect(
        service.changePassword(ADMIN_ID, {
          old_password: 'CurrentAdmin@123',
          new_password: 'CurrentAdmin@123',
          confirm_password: 'CurrentAdmin@123',
        }),
      ).rejects.toThrow(
        new UnprocessableEntityException(SYS_MSG.ADMIN_NEW_PASSWORD_MUST_DIFFER_FROM_OLD),
      );

      expect(mockAdminProfileAction.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('AC-06 / SEC-02: revokes all existing sessions after successful password change', async () => {
      await service.changePassword(ADMIN_ID, dto);
      expect(mockAdminProfileAction.revokeAllSessions).toHaveBeenCalledTimes(1);
      expect(mockAdminProfileAction.revokeAllSessions).toHaveBeenCalledWith(ADMIN_ID);
    });

    it('AC-07: writes audit log with action_type=password_changed and no password values', async () => {
      await service.changePassword(ADMIN_ID, dto);

      const loggedPayload = JSON.stringify(mockLogService.logAction.mock.calls[0][0]);
      expect(loggedPayload).toContain('password_changed');
      expect(loggedPayload).toContain('fields_changed');
      expect(loggedPayload).not.toContain(dto.old_password);
      expect(loggedPayload).not.toContain(dto.new_password);
    });

    it('EC-03: second rapid request can return 401 after first request changes stored hash', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(service.changePassword(ADMIN_ID, dto)).resolves.toBeUndefined();
      await expect(service.changePassword(ADMIN_ID, dto)).rejects.toThrow(
        new UnauthorizedException(SYS_MSG.ADMIN_OLD_PASSWORD_INCORRECT),
      );
    });

    it('SEC-01: uses bcrypt.compare and never compares plain text passwords directly', async () => {
      await service.changePassword(ADMIN_ID, dto);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(bcrypt.compare).toHaveBeenCalledWith(dto.old_password, ADMIN_USER.password_hash);
    });

    it('throws 404 when admin account no longer exists', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(null);

      await expect(service.changePassword(ADMIN_ID, dto)).rejects.toThrow(
        new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND),
      );
    });

    it('throws 422 when password change is unavailable for account without password_hash', async () => {
      mockAdminProfileAction.findById.mockResolvedValue({ ...ADMIN_USER, password_hash: null });

      await expect(service.changePassword(ADMIN_ID, dto)).rejects.toThrow(
        new UnprocessableEntityException(SYS_MSG.PASSWORD_CHANGE_UNAVAILABLE),
      );
    });

    it('throws 500 when updatePasswordHash returns null', async () => {
      mockAdminProfileAction.updatePasswordHash.mockResolvedValue(null);

      await expect(service.changePassword(ADMIN_ID, dto)).rejects.toThrow(
        new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_UPDATE_FAILED),
      );
    });
  });
});
