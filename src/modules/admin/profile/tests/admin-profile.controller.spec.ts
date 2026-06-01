import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { AdminProfileController } from '../admin-profile.controller';
import { AdminProfileService } from '../admin-profile.service';

const mockAdminProfileService = {
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
};

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const PROFILE = {
  id: ADMIN_ID,
  full_name: 'Jane Admin',
  email: 'admin@example.com',
  country: 'Nigeria',
  avatar_url: null,
  role: 'admin',
  created_at: new Date('2026-05-29T10:30:00.000Z'),
};

describe('AdminProfileController', () => {
  let controller: AdminProfileController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminProfileController],
      providers: [
        { provide: AdminProfileService, useValue: mockAdminProfileService },
        { provide: AdminJwtGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: RolesGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
      ],
    }).compile();

    controller = module.get<AdminProfileController>(AdminProfileController);
  });

  describe('GET /admin/profile', () => {
    it('AC-01: returns authenticated admin profile including role', async () => {
      mockAdminProfileService.getProfile.mockResolvedValue(PROFILE);

      const result = await controller.getProfile(ADMIN_ID);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_PROFILE_RETRIEVED_SUCCESSFULLY,
        data: PROFILE,
      });
      expect(mockAdminProfileService.getProfile).toHaveBeenCalledWith(ADMIN_ID);
    });

    it('SEC-01: never includes password_hash in response payload', async () => {
      mockAdminProfileService.getProfile.mockResolvedValue(PROFILE);

      const result = await controller.getProfile(ADMIN_ID);

      expect(result.data).not.toHaveProperty('password_hash');
    });
  });

  describe('PATCH /admin/profile', () => {
    it('AC-02: updates allowed profile fields and returns HTTP 200', async () => {
      const updated = { ...PROFILE, full_name: 'Jane Updated' };
      mockAdminProfileService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(ADMIN_ID, {
        full_name: 'Jane Updated',
      });

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_PROFILE_UPDATED_SUCCESSFULLY,
        data: updated,
      });
      expect(mockAdminProfileService.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {
        full_name: 'Jane Updated',
      });
    });

    it('AC-05: empty body returns HTTP 200 with unchanged profile', async () => {
      mockAdminProfileService.updateProfile.mockResolvedValue(PROFILE);

      const result = await controller.updateProfile(ADMIN_ID, {});

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(PROFILE);
      expect(mockAdminProfileService.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {});
    });
  });
});
