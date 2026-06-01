import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AdminUsersService } from '../admin-users.service';
import { UserModelAction } from '../../../users/actions/user.action';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UsersService } from '../../../users/users.service';
import { UserRole } from '../../../users/enums/user-role.enum';
import * as SYS_MSG from '../../../../constants/system.messages';

jest.mock('bcrypt');

const mockUsersService = { findByEmail: jest.fn() };
const mockUserModelAction = { create: jest.fn() };
const mockUserRoleModelAction = { create: jest.fn() };

const CREATED_USER = { id: 'user-uuid-1', email: 'jane@example.com' };

const CREATE_ADMIN_DTO = {
  full_name: 'Jane Admin',
  email: 'jane@example.com',
  password: 'Admin@Pass1!',
  role: UserRole.ADMIN as UserRole.ADMIN | UserRole.SUPER_ADMIN,
};

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  describe('createAdmin', () => {
    it('creates the user row, assigns the role, and returns a success message', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(CREATED_USER);
      mockUserRoleModelAction.create.mockResolvedValue(undefined);

      const result = await service.createAdmin(CREATE_ADMIN_DTO);

      expect(result).toEqual({ message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY });
      expect(mockUserModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: expect.objectContaining({
            email: CREATE_ADMIN_DTO.email,
            full_name: CREATE_ADMIN_DTO.full_name,
            is_verified: true,
          }),
        }),
      );
      expect(mockUserRoleModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: { user_id: CREATED_USER.id, role: UserRole.ADMIN },
        }),
      );
    });

    it('hashes the password with bcrypt 12 rounds before storing', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(CREATED_USER);
      mockUserRoleModelAction.create.mockResolvedValue(undefined);

      await service.createAdmin(CREATE_ADMIN_DTO);

      expect(bcrypt.hash).toHaveBeenCalledWith(CREATE_ADMIN_DTO.password, 12);
      const [[{ createPayload }]] = mockUserModelAction.create.mock.calls;
      expect(createPayload.password_hash).toBe('hashed-password');
    });

    it('assigns super_admin role when dto.role is super_admin', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(CREATED_USER);
      mockUserRoleModelAction.create.mockResolvedValue(undefined);

      await service.createAdmin({ ...CREATE_ADMIN_DTO, role: UserRole.SUPER_ADMIN });

      expect(mockUserRoleModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: { user_id: CREATED_USER.id, role: UserRole.SUPER_ADMIN },
        }),
      );
    });

    it('throws 409 when email already exists (pre-check)', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing-uuid' });

      await expect(service.createAdmin(CREATE_ADMIN_DTO)).rejects.toThrow(
        new ConflictException(SYS_MSG.ADMIN_EMAIL_CONFLICT),
      );
      expect(mockUserModelAction.create).not.toHaveBeenCalled();
    });

    it('throws 409 on DB unique constraint violation (race condition path)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockRejectedValue({
        driverError: { code: '23505' },
      });

      await expect(service.createAdmin(CREATE_ADMIN_DTO)).rejects.toThrow(
        new ConflictException(SYS_MSG.ADMIN_EMAIL_CONFLICT),
      );
    });

    it('rethrows unexpected errors rather than swallowing them', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockRejectedValue(new InternalServerErrorException('DB exploded'));

      await expect(service.createAdmin(CREATE_ADMIN_DTO)).rejects.toThrow(InternalServerErrorException);
    });

    it('does not create a role row when user creation fails', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockRejectedValue(new Error('unexpected'));

      await expect(service.createAdmin(CREATE_ADMIN_DTO)).rejects.toThrow();
      expect(mockUserRoleModelAction.create).not.toHaveBeenCalled();
    });
  });
});
