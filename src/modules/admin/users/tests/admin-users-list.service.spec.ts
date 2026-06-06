import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminUsersService } from '../admin-users.service';
import { AdminUsersListAction, RawAdminUserRow } from '../actions/admin-users-list.action';
import { UserModelAction } from '../../../users/actions/user.action';
import { UserRoleModelAction } from '../../../users/actions/user-role.action';
import { UsersService } from '../../../users/users.service';
import { UserPlan } from '../../../users/enums/user-plan.enum';
import { SortDir, UserSortBy, UserStatusFilter } from '../enums/admin-users-query.enum';
import { GetAdminUsersQueryDto } from '../dto/get-admin-users-query.dto';
import { UserSessionModelAction } from '../../../users/actions/user-session.action';
import { AdminUserDetailAction } from '../actions/admin-user-detail.action';
import { LogService } from '../../profile/services/log.service';
import { RedisService } from '../../../redis/redis.service';
import { getQueueToken } from '@nestjs/bull';
import { ACCOUNT_DELETION_QUEUE } from '../../../users/processors/account-deletion.processor';

// Dates relative to now — clearly within / outside the 30-day window regardless of when tests run
const activeLoginAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);  // 10 days ago
const inactiveLoginAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago

const makeRow = (overrides: Partial<RawAdminUserRow> = {}): RawAdminUserRow => ({
  user_id: 'uuid-1',
  user_full_name: 'Jane Doe',
  user_email: 'jane@example.com',
  user_plan: UserPlan.FREE,
  user_created_at: new Date('2024-01-01T00:00:00.000Z'),
  auth_last_login_at: activeLoginAt,
  funnel_count: '3',
  ...overrides,
});

const mockUsersService = { findByEmail: jest.fn() };
const mockUserModelAction = { create: jest.fn() };
const mockUserRoleModelAction = { create: jest.fn() };
const mockDataSource = { transaction: jest.fn() };
const mockAdminUsersListAction = { findUsersWithFilters: jest.fn() };
const mockUserSessionModelAction = { revokeAllUserSessionsInDb: jest.fn() };
const mockAdminUserDetailAction = { findUserWithDetails: jest.fn() };
const mockLogService = { logAction: jest.fn() };
const mockRedisService = { delByPattern: jest.fn() };
const mockQueue = { add: jest.fn() };

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: UserRoleModelAction, useValue: mockUserRoleModelAction },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AdminUsersListAction, useValue: mockAdminUsersListAction },
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: AdminUserDetailAction, useValue: mockAdminUserDetailAction },
        { provide: LogService, useValue: mockLogService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken(ACCOUNT_DELETION_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  describe('listUsers', () => {
    beforeEach(() => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[makeRow()], 1]);
    });

    // --- Happy path ---

    it('AC-01: returns a data array and a meta object', async () => {
      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('AC-01: maps every row field to the correct response shape', async () => {
      const row = makeRow({ funnel_count: '5', auth_last_login_at: activeLoginAt });
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[row], 1]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);
      const item = result.data[0];

      expect(item.id).toBe(row.user_id);
      expect(item.full_name).toBe(row.user_full_name);
      expect(item.email).toBe(row.user_email);
      expect(item.plan).toBe(UserPlan.FREE);
      expect(item.funnel_count).toBe(5);
      expect(item.created_at).toBeInstanceOf(Date);
      expect(item.last_active_at).toBeInstanceOf(Date);
    });

    it('AC-01: maps all rows — not just the first', async () => {
      const rows = [
        makeRow({ user_id: 'uuid-1', user_email: 'a@example.com' }),
        makeRow({ user_id: 'uuid-2', user_email: 'b@example.com' }),
        makeRow({ user_id: 'uuid-3', user_email: 'c@example.com' }),
      ];
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([rows, 3]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result.data).toHaveLength(3);
      expect(result.data[0].id).toBe('uuid-1');
      expect(result.data[1].id).toBe('uuid-2');
      expect(result.data[2].id).toBe('uuid-3');
    });

    it('AC-01: returns empty data array and correct meta when no users match', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[], 0]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result.data).toHaveLength(0);
      expect(result.meta).toEqual({ total: 0, page: 1, per_page: 20, has_next: false });
    });

    // --- Status filter ---

    it('AC-02: passes status=active to action', async () => {
      const dto = { status: UserStatusFilter.ACTIVE } as GetAdminUsersQueryDto;

      await service.listUsers(dto);

      expect(mockAdminUsersListAction.findUsersWithFilters).toHaveBeenCalledWith(
        UserStatusFilter.ACTIVE,
        undefined,
        1,
        20,
        UserSortBy.CREATED_AT,
        SortDir.DESC,
      );
    });

    it('AC-02: row with last_login_at within 30 days maps to status=active', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([
        [makeRow({ auth_last_login_at: activeLoginAt })],
        1,
      ]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result.data[0].status).toBe(UserStatusFilter.ACTIVE);
    });

    it('AC-03: passes status=inactive to action', async () => {
      const dto = { status: UserStatusFilter.INACTIVE } as GetAdminUsersQueryDto;

      await service.listUsers(dto);

      expect(mockAdminUsersListAction.findUsersWithFilters).toHaveBeenCalledWith(
        UserStatusFilter.INACTIVE,
        undefined,
        1,
        20,
        UserSortBy.CREATED_AT,
        SortDir.DESC,
      );
    });

    it('AC-03: row with last_login_at older than 30 days maps to status=inactive', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([
        [makeRow({ auth_last_login_at: inactiveLoginAt })],
        1,
      ]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result.data[0].status).toBe(UserStatusFilter.INACTIVE);
    });

    // --- Search ---

    it('AC-04: passes search param through to action', async () => {
      const dto = { search: 'jane' } as GetAdminUsersQueryDto;

      await service.listUsers(dto);

      expect(mockAdminUsersListAction.findUsersWithFilters).toHaveBeenCalledWith(
        UserStatusFilter.ALL,
        'jane',
        1,
        20,
        UserSortBy.CREATED_AT,
        SortDir.DESC,
      );
    });

    // --- Pagination meta ---

    it('AC-05: meta includes total, page, per_page, and has_next=true when records remain', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[makeRow()], 100]);

      const result = await service.listUsers({ page: 1, perPage: 20 } as GetAdminUsersQueryDto);

      expect(result.meta).toEqual({ total: 100, page: 1, per_page: 20, has_next: true });
    });

    it('AC-05: has_next=false when page*perPage equals total (exact last page)', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[makeRow()], 20]);

      const result = await service.listUsers({ page: 1, perPage: 20 } as GetAdminUsersQueryDto);

      expect(result.meta.has_next).toBe(false);
    });

    it('AC-05: has_next=true when total is one more than page*perPage', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[makeRow()], 21]);

      const result = await service.listUsers({ page: 1, perPage: 20 } as GetAdminUsersQueryDto);

      expect(result.meta.has_next).toBe(true);
    });

    it('AC-05: has_next=false on the final page when multi-page result is exactly consumed', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[makeRow()], 40]);

      const result = await service.listUsers({ page: 4, perPage: 10 } as GetAdminUsersQueryDto);

      expect(result.meta.has_next).toBe(false);
    });

    // --- perPage cap ---

    it('AC-07: silently caps perPage=1000 — action is called with 50, not 1000', async () => {
      await service.listUsers({ perPage: 1000 } as GetAdminUsersQueryDto);

      const callArgs = mockAdminUsersListAction.findUsersWithFilters.mock.calls[0];
      expect(callArgs[3]).toBe(50);
    });

    it('AC-07: meta.per_page reflects the capped value of 50', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([[makeRow()], 200]);

      const result = await service.listUsers({ perPage: 1000 } as GetAdminUsersQueryDto);

      expect(result.meta.per_page).toBe(50);
    });

    // --- Security ---

    it('SEC-01: response items never include password_hash, provider_user_id, or deleted_at', async () => {
      const result = await service.listUsers({} as GetAdminUsersQueryDto);
      const item = result.data[0];

      expect(item).not.toHaveProperty('password_hash');
      expect(item).not.toHaveProperty('provider_user_id');
      expect(item).not.toHaveProperty('deleted_at');
    });

    it('SEC-01: response items contain only the expected keys', async () => {
      const result = await service.listUsers({} as GetAdminUsersQueryDto);
      const keys = Object.keys(result.data[0]);

      expect(keys.sort()).toEqual(
        ['id', 'full_name', 'email', 'plan', 'status', 'created_at', 'last_active_at', 'funnel_count'].sort(),
      );
    });

    // --- Edge cases ---

    it('EC-03: null auth_last_login_at maps to status=inactive and last_active_at=null without throwing', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([
        [makeRow({ auth_last_login_at: null })],
        1,
      ]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);
      const item = result.data[0];

      expect(item.status).toBe(UserStatusFilter.INACTIVE);
      expect(item.last_active_at).toBeNull();
    });

    it('EC-02: funnel_count of zero is returned as 0, not NaN or null', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([
        [makeRow({ funnel_count: '0' })],
        1,
      ]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result.data[0].funnel_count).toBe(0);
      expect(Number.isNaN(result.data[0].funnel_count)).toBe(false);
    });

    it('maps plan=pro correctly', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockResolvedValue([
        [makeRow({ user_plan: UserPlan.PRO })],
        1,
      ]);

      const result = await service.listUsers({} as GetAdminUsersQueryDto);

      expect(result.data[0].plan).toBe(UserPlan.PRO);
    });

    it('passes custom sortBy and sortDir through to action', async () => {
      const dto = { sortBy: UserSortBy.FULL_NAME, sortDir: SortDir.ASC } as GetAdminUsersQueryDto;

      await service.listUsers(dto);

      expect(mockAdminUsersListAction.findUsersWithFilters).toHaveBeenCalledWith(
        UserStatusFilter.ALL,
        undefined,
        1,
        20,
        UserSortBy.FULL_NAME,
        SortDir.ASC,
      );
    });

    it('error thrown by action propagates — service does not swallow it', async () => {
      mockAdminUsersListAction.findUsersWithFilters.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.listUsers({} as GetAdminUsersQueryDto)).rejects.toThrow('DB connection lost');
    });

    // --- Defaults ---

    it('applies defaults when DTO fields are all undefined', async () => {
      await service.listUsers({} as GetAdminUsersQueryDto);

      expect(mockAdminUsersListAction.findUsersWithFilters).toHaveBeenCalledWith(
        UserStatusFilter.ALL,
        undefined,
        1,
        20,
        UserSortBy.CREATED_AT,
        SortDir.DESC,
      );
    });

    // --- Negative assertions ---

    it('does not call usersService.findByEmail during a list operation', async () => {
      await service.listUsers({} as GetAdminUsersQueryDto);

      expect(mockUsersService.findByEmail).not.toHaveBeenCalled();
    });

    it('does not write to the DB during a list operation', async () => {
      await service.listUsers({} as GetAdminUsersQueryDto);

      expect(mockUserModelAction.create).not.toHaveBeenCalled();
      expect(mockUserRoleModelAction.create).not.toHaveBeenCalled();
    });
  });
});
