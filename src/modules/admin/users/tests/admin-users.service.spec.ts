import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AdminUsersService } from '../admin-users.service';
import { UserModelAction } from '../../../users/actions/user.action';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UsersService } from '../../../users/users.service';
import { UserRole } from '../../../users/enums/user-role.enum';
import { UserAccountStatus } from '../../../users/enums/user-account-status.enum';
import * as SYS_MSG from '../../../../constants/system.messages';
import { UserSessionModelAction } from '../../../users/actions/user-session.action';
import { AdminUserDetailAction } from '../actions/admin-user-detail.action';
import { LogService } from '../../profile/services/log.service';
import { RedisService } from '../../../redis/redis.service';
import { getQueueToken } from '@nestjs/bull';
import { ACCOUNT_DELETION_QUEUE } from '../../../users/processors/account-deletion.processor';
import { AdminUsersListAction } from '../actions/admin-users-list.action';

jest.mock('bcrypt');

const mockUsersService = { findByEmail: jest.fn() };
const mockUserModelAction = { create: jest.fn() };
const mockUserRoleModelAction = { create: jest.fn() };
const mockUserSessionModelAction = { revokeAllUserSessionsInDb: jest.fn() };
const mockAdminUserDetailAction = { findUserWithDetails: jest.fn() };
const mockLogService = { logAction: jest.fn() };
const mockRedisService = { delByPattern: jest.fn() };
const mockQueue = { add: jest.fn() };

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: { update: jest.fn() },
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: (m: unknown) => Promise<unknown>) => cb({})),
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

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
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: AdminUserDetailAction, useValue: mockAdminUserDetailAction },
        { provide: AdminUsersListAction, useValue: {} },
        { provide: LogService, useValue: mockLogService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken(ACCOUNT_DELETION_QUEUE), useValue: mockQueue },
        { provide: DataSource, useValue: mockDataSource },
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

  describe('getUserProfile', () => {
    it('throws 404 if user not found', async () => {
      mockAdminUserDetailAction.findUserWithDetails.mockResolvedValue({ user: null });
      await expect(service.getUserProfile('user-1')).rejects.toThrow(SYS_MSG.ADMIN_USER_NOT_FOUND);
    });

    it('maps and returns user details properly', async () => {
      mockAdminUserDetailAction.findUserWithDetails.mockResolvedValue({
        user: { full_name: 'Test', email: 'test@test.com', plan: 'free', country: 'US', created_at: new Date(), status: 'active', deleted_at: null, business_type: 'biz', target_customer: 'target', pri
        funnels: [{ id: 'f1', funnel_name: 'F1', stage_count: 2, created_at: new Date(), status: 'generating' }],
        documents: [],
      });
      const result = await service.getUserProfile('user-1');
      expect(result.profile.fullName).toBe('Test');
      expect(result.strategies.length).toBe(1);
    });
  });

  describe('updateUserStatus', () => {
    it('throws 404 if user not found', async () => {
      mockUserModelAction.findById = jest.fn().mockResolvedValue(null);
      await expect(service.updateUserStatus('user-1', UserAccountStatus.SUSPENDED, 'admin-1')).rejects.toThrow(SYS_MSG.ADMIN_USER_NOT_FOUND);
    });

    it('updates user status and logs action', async () => {
      mockUserModelAction.findById = jest.fn().mockResolvedValue({ id: 'user-1' });
      mockUserModelAction.update = jest.fn().mockResolvedValue(true);
      await service.updateUserStatus('user-1', UserAccountStatus.SUSPENDED, 'admin-1');
      expect(mockUserModelAction.update).toHaveBeenCalled();
      expect(mockLogService.logAction).toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('throws forbidden if admin deletes self', async () => {
      await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow(SYS_MSG.ADMIN_CANNOT_DELETE_SELF);
    });

    it('throws 404 if user not found', async () => {
      mockUserModelAction.findById = jest.fn().mockResolvedValue(null);
      await expect(service.deleteUser('user-1', 'admin-2')).rejects.toThrow(SYS_MSG.ADMIN_USER_NOT_FOUND);
    });

    it('soft deletes user and revokes sessions', async () => {
      mockUserModelAction.findById = jest.fn().mockResolvedValue({ id: 'user-1', constructor: {} });
      mockUserSessionModelAction.revokeAllUserSessionsInDb.mockResolvedValue(['session-1']);
      await service.deleteUser('user-1', 'admin-2');
      expect(mockQueryRunner.manager.update).toHaveBeenCalled();
      expect(mockRedisService.delByPattern).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
      expect(mockLogService.logAction).toHaveBeenCalled();
    });
  });
});
