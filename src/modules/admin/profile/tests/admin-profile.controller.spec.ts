import { HttpStatus } from '@nestjs/common';
import { UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../users/enums/user-role.enum';
import { UpdateAdminProfileDto } from '../dto/update-admin-profile.dto';
import { AdminProfileController } from '../admin-profile.controller';
import { AdminProfileService } from '../admin-profile.service';

const mockAdminProfileService = {
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
};

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ADMIN_USER: AuthenticatedUser = {
  userId: ADMIN_ID,
  sub: ADMIN_ID,
  email: 'admin@example.com',
  sessionId: 'sess-123',
  role: UserRole.ADMIN,
};

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

  const createValidationPipe = () =>
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      expectedType: UpdateAdminProfileDto,
      validationError: { target: false, value: false },
      exceptionFactory: (errors: ValidationError[]) =>
        new UnprocessableEntityException({
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntityException',
          message: SYS_MSG.VALIDATION_FAILED,
          details: errors,
        }),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminProfileController(
      mockAdminProfileService as unknown as AdminProfileService,
    );
  });

  describe('GET /admin/profile', () => {
    it('AC-01: returns authenticated admin profile including role', async () => {
      mockAdminProfileService.getProfile.mockResolvedValue(PROFILE);

      const result = await controller.getProfile(ADMIN_USER);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_PROFILE_RETRIEVED_SUCCESSFULLY,
        data: PROFILE,
      });
      expect(mockAdminProfileService.getProfile).toHaveBeenCalledWith(ADMIN_ID, 'admin');
    });

    it('SEC-01: never includes password_hash in response payload', async () => {
      mockAdminProfileService.getProfile.mockResolvedValue(PROFILE);

      const result = await controller.getProfile(ADMIN_USER);

      expect(result.data).not.toHaveProperty('password_hash');
    });
  });

  describe('PATCH /admin/profile', () => {
    it('AC-02: updates allowed profile fields and returns HTTP 200', async () => {
      const updated = { ...PROFILE, full_name: 'Jane Updated' };
      mockAdminProfileService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(ADMIN_USER, {
        full_name: 'Jane Updated',
      });

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_PROFILE_UPDATED_SUCCESSFULLY,
        data: updated,
      });
      expect(mockAdminProfileService.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {
        full_name: 'Jane Updated',
      }, 'admin');
    });

    it('AC-05: empty body returns HTTP 200 with unchanged profile', async () => {
      mockAdminProfileService.updateProfile.mockResolvedValue(PROFILE);

      const result = await controller.updateProfile(ADMIN_USER, {});

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(PROFILE);
      expect(mockAdminProfileService.updateProfile).toHaveBeenCalledWith(ADMIN_ID, {}, 'admin');
    });
  });

  describe('PATCH /admin/profile/password', () => {
    it('AC-01: returns HTTP 200 when old password is correct and new password is valid', async () => {
      mockAdminProfileService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(ADMIN_ID, {
        old_password: 'CurrentAdmin@123',
        new_password: 'NewAdmin!789',
        confirm_password: 'NewAdmin!789',
      });

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_PASSWORD_UPDATED_SUCCESSFULLY,
        data: null,
      });
      expect(mockAdminProfileService.changePassword).toHaveBeenCalledWith(ADMIN_ID, {
        old_password: 'CurrentAdmin@123',
        new_password: 'NewAdmin!789',
        confirm_password: 'NewAdmin!789',
      });
    });

    it('AC-07: controller never includes password values in response payload', async () => {
      mockAdminProfileService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(ADMIN_ID, {
        old_password: 'CurrentAdmin@123',
        new_password: 'NewAdmin!789',
        confirm_password: 'NewAdmin!789',
      }) as unknown as Record<string, unknown>;

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('CurrentAdmin@123');
      expect(serialized).not.toContain('NewAdmin!789');
    });

    it('uses ValidationPipe config to reject non-whitelisted fields with 422 envelope', async () => {
      await expect(
        createValidationPipe().transform(
          { full_name: 'Jane Admin', extra_field: 'nope' },
          { type: 'body', metatype: UpdateAdminProfileDto, data: '' },
        ),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('uses ValidationPipe config to trim input values during transformation', async () => {
      const result = (await createValidationPipe().transform(
        { full_name: '  Jane Admin  ' },
        { type: 'body', metatype: UpdateAdminProfileDto, data: '' },
      )) as UpdateAdminProfileDto;

      expect(result.full_name).toBe('Jane Admin');
    });
  });
});
