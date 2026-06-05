import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { UserRole } from '../../../users/enums/user-role.enum';
import { UserPlan } from '../../../users/enums/user-plan.enum';
import { AdminUsersController } from '../admin-users.controller';
import { AdminUsersService } from '../admin-users.service';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { GetAdminUsersQueryDto } from '../dto/get-admin-users-query.dto';
import { SortDir, UserSortBy, UserStatusFilter } from '../enums/admin-users-query.enum';

const MOCK_LIST_RESPONSE = {
  data: [
    {
      id: 'uuid-1',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      plan: UserPlan.FREE,
      status: UserStatusFilter.ACTIVE,
      created_at: new Date('2024-01-01'),
      last_active_at: new Date(),
      funnel_count: 3,
    },
  ],
  meta: { total: 1, page: 1, per_page: 20, has_next: false },
};

const mockAdminUsersService = {
  createAdmin: jest.fn(),
  listUsers: jest.fn(),
  getUserProfile: jest.fn(),
  updateUserStatus: jest.fn(),
  deleteUser: jest.fn(),
};

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let service: AdminUsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAdminUsersService.listUsers.mockResolvedValue(MOCK_LIST_RESPONSE);
    mockAdminUsersService.createAdmin.mockResolvedValue({ message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [{ provide: AdminUsersService, useValue: mockAdminUsersService }],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
    service = module.get<AdminUsersService>(AdminUsersService);
  });

  describe('listUsers', () => {
    it('AC-01: calls service.listUsers with the query DTO', async () => {
      const query = { status: UserStatusFilter.ACTIVE, page: 1, perPage: 20 } as GetAdminUsersQueryDto;

      await controller.listUsers(query);

      expect(service.listUsers).toHaveBeenCalledWith(query);
    });

    it('AC-01: returns Shape A — statusCode, message, and data payload', async () => {
      const result = await controller.listUsers({} as GetAdminUsersQueryDto);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_USERS_LIST_RETRIEVED,
        data: MOCK_LIST_RESPONSE,
      });
    });

    it('AC-01: response does not include success:true — TransformInterceptor adds it', async () => {
      const result = await controller.listUsers({} as GetAdminUsersQueryDto);

      expect(result).not.toHaveProperty('success');
    });

    it('AC-04: passes search query param through to service', async () => {
      const query = { search: 'jane' } as GetAdminUsersQueryDto;

      await controller.listUsers(query);

      expect(service.listUsers).toHaveBeenCalledWith(expect.objectContaining({ search: 'jane' }));
    });

    it('passes custom sort params through to service', async () => {
      const query = { sortBy: UserSortBy.FULL_NAME, sortDir: SortDir.ASC } as GetAdminUsersQueryDto;

      await controller.listUsers(query);

      expect(service.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: UserSortBy.FULL_NAME, sortDir: SortDir.ASC }),
      );
    });

    it('propagates service errors to the caller', async () => {
      (service.listUsers as jest.Mock).mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(controller.listUsers({} as GetAdminUsersQueryDto)).rejects.toThrow('DB connection lost');
    });

    it('does not call service.createAdmin during a list request', async () => {
      await controller.listUsers({} as GetAdminUsersQueryDto);

      expect(service.createAdmin).not.toHaveBeenCalled();
    });
  });

  describe('createAdmin', () => {
    const CREATE_ADMIN_DTO: CreateAdminDto = {
      full_name: 'Jane Admin',
      email: 'jane@example.com',
      password: 'Admin@Pass1!',
      role: UserRole.ADMIN,
    };

    it('calls service.createAdmin with the body DTO', async () => {
      await controller.createAdmin(CREATE_ADMIN_DTO);

      expect(service.createAdmin).toHaveBeenCalledWith(CREATE_ADMIN_DTO);
    });

    it('returns Shape B — statusCode and message, no data field', async () => {
      const result = await controller.createAdmin(CREATE_ADMIN_DTO);

      expect(result).toEqual({
        statusCode: HttpStatus.CREATED,
        message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY,
      });
      expect(result).not.toHaveProperty('data');
    });

    it('propagates service errors to the caller', async () => {
      (service.createAdmin as jest.Mock).mockRejectedValueOnce(new Error('conflict'));

      await expect(controller.createAdmin(CREATE_ADMIN_DTO)).rejects.toThrow('conflict');
    });

    it('does not call service.listUsers during a create request', async () => {
      await controller.createAdmin(CREATE_ADMIN_DTO);

      expect(service.listUsers).not.toHaveBeenCalled();
    });
  });

  describe('getUserProfile', () => {
    it('calls service.getUserProfile and returns profile data', async () => {
      const mockProfile = { profile: {}, strategies: [], documents: [], informationProvided: {} };
      (service.getUserProfile as jest.Mock).mockResolvedValueOnce(mockProfile);

      const result = await controller.getUserProfile('user-1');

      expect(service.getUserProfile).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_USER_PROFILE_RETRIEVED,
        data: mockProfile,
      });
    });
  });

  describe('updateUserStatus', () => {
    it('calls service.updateUserStatus and returns success message', async () => {
      (service.updateUserStatus as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await controller.updateUserStatus('user-1', { status: 'suspended' } as any, 'admin-1');

      expect(service.updateUserStatus).toHaveBeenCalledWith('user-1', 'suspended', 'admin-1');
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_USER_STATUS_UPDATED,
      });
    });
  });

  describe('deleteUser', () => {
    it('calls service.deleteUser and returns success message', async () => {
      (service.deleteUser as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await controller.deleteUser('user-1', 'admin-1');

      expect(service.deleteUser).toHaveBeenCalledWith('user-1', 'admin-1');
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_USER_DELETED,
      });
    });
  });
});
