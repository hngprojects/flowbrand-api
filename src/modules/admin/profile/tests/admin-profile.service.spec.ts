import {
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UserRole } from '../../../users/enums/user-role.enum';
import { AdminProfileModelAction } from '../actions/admin-profile.action';
import { AdminProfileService } from '../admin-profile.service';
import { LogService } from '../services/log.service';

const mockAdminProfileAction = {
  findById: jest.fn(),
  updateProfile: jest.fn(),
};

const mockUserRoleModelAction = {
  resolveHighestRole: jest.fn(),
};

const mockLogService = {
  logAction: jest.fn(),
};

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FALLBACK_ROLE = UserRole.ADMIN;

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

      const result = await service.getProfile(ADMIN_ID, FALLBACK_ROLE);

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

      const result = (await service.getProfile(ADMIN_ID, FALLBACK_ROLE)) as unknown as Record<string, unknown>;

      expect(result).not.toHaveProperty('password_hash');
    });

    it('throws 404 when admin row does not exist', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(null);

      await expect(service.getProfile(ADMIN_ID, FALLBACK_ROLE)).rejects.toThrow(
        new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND),
      );
    });
  });

  describe('updateProfile', () => {
    it('AC-03 / SEC-02: throws 422 when email appears in request body', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      await expect(
        service.updateProfile(ADMIN_ID, { email: 'other@example.com' }, FALLBACK_ROLE),
      ).rejects.toThrow(new UnprocessableEntityException(SYS_MSG.ADMIN_PROFILE_EMAIL_CHANGE_FORBIDDEN));

      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
    });

    it('AC-05: empty body returns current profile and skips DB write', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      const result = await service.updateProfile(ADMIN_ID, {}, FALLBACK_ROLE);

      expect(result.full_name).toBe('Jane Admin');
      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });

    it('EC-01: no-change full_name returns current profile without DB write', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      const result = await service.updateProfile(ADMIN_ID, { full_name: 'Jane Admin' }, FALLBACK_ROLE);

      expect(result.full_name).toBe('Jane Admin');
      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });

    it('EC-01: no-change country returns current profile without DB write', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);

      await service.updateProfile(ADMIN_ID, { country: 'Nigeria' }, FALLBACK_ROLE);

      expect(mockAdminProfileAction.updateProfile).not.toHaveBeenCalled();
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });

    it('AC-02: updates full_name and logs action_type=profile_updated', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue({
        ...ADMIN_USER,
        full_name: 'Jane Updated',
      });

      const result = await service.updateProfile(ADMIN_ID, { full_name: 'Jane Updated' }, FALLBACK_ROLE);

      expect(result.full_name).toBe('Jane Updated');
      expect(mockAdminProfileAction.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {
        full_name: 'Jane Updated',
      });
      expect(mockLogService.logAction).toHaveBeenCalledWith({
        admin_id: ADMIN_ID,
        action_type: 'profile_updated',
        metadata: { updated_fields: ['full_name'] },
      });
    });

    it('AC-02 / EC-03: partial country update only updates country field', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue({
        ...ADMIN_USER,
        country: 'Ghana',
      });

      const result = await service.updateProfile(ADMIN_ID, { country: 'Ghana' }, FALLBACK_ROLE);

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
      }, FALLBACK_ROLE);

      expect(result.full_name).toBe('Jane Updated');
      expect(result.country).toBe('Ghana');
      expect(mockLogService.logAction).toHaveBeenCalledWith({
        admin_id: ADMIN_ID,
        action_type: 'profile_updated',
        metadata: { updated_fields: ['full_name', 'country'] },
      });
    });

    it('throws 404 when admin cannot be found before update', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(null);

      await expect(service.updateProfile(ADMIN_ID, { full_name: 'Different Name' }, FALLBACK_ROLE)).rejects.toThrow(
        new NotFoundException(SYS_MSG.ADMIN_PROFILE_NOT_FOUND),
      );
    });

    it('throws 500 when DB returns null on update', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockAdminProfileAction.updateProfile.mockResolvedValue(null);

      await expect(service.updateProfile(ADMIN_ID, { full_name: 'Different Name' }, FALLBACK_ROLE)).rejects.toThrow(
        new InternalServerErrorException(SYS_MSG.ADMIN_PROFILE_UPDATE_FAILED),
      );
    });

    it('falls back to JWT role when role resolution fails', async () => {
      mockAdminProfileAction.findById.mockResolvedValue(ADMIN_USER);
      mockUserRoleModelAction.resolveHighestRole.mockRejectedValue(new Error('db down'));

      const result = await service.updateProfile(ADMIN_ID, {}, FALLBACK_ROLE);

      expect(result.role).toBe(FALLBACK_ROLE);
      expect(mockLogService.logAction).not.toHaveBeenCalled();
    });  });
});
