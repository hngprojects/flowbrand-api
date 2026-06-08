import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminLogsListAction, RawAdminLogRow } from '../actions/admin-logs-list.action';
import { AdminLogsService } from '../admin-logs.service';
import { GetAdminLogsQueryDto } from '../dto/get-admin-logs-query.dto';
import { AdminLogActionType, AdminLogStatus } from '../enums/admin-log.enum';

const makeRow = (overrides: Partial<RawAdminLogRow> = {}): RawAdminLogRow => ({
  log_id: 'log-uuid-1',
  log_user_id: 'user-uuid-1',
  user_full_name: 'Jane Doe',
  user_email: 'jane@example.com',
  log_action_type: AdminLogActionType.LOGIN,
  log_description: 'User logged in',
  log_ip_address: '102.89.33.21',
  log_status: AdminLogStatus.SUCCESS,
  log_created_at: new Date('2026-06-06T09:15:00.000Z'),
  ...overrides,
});

const mockAdminLogsListAction = { findLogsWithFilters: jest.fn() };

describe('AdminLogsService', () => {
  let service: AdminLogsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAdminLogsListAction.findLogsWithFilters.mockResolvedValue([[makeRow()], 1]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminLogsService,
        { provide: AdminLogsListAction, useValue: mockAdminLogsListAction },
      ],
    }).compile();

    service = module.get<AdminLogsService>(AdminLogsService);
  });

  describe('listLogs', () => {
    // --- Happy path / envelope ---

    it('AC-01: returns a data array and a pagination meta object', async () => {
      const result = await service.listLogs({} as GetAdminLogsQueryDto);

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta).toEqual({ total: 1, page: 1, per_page: 20, has_next: false });
    });

    it('AC-01: applies default page 1 and per_page 20 when omitted', async () => {
      await service.listLogs({} as GetAdminLogsQueryDto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, perPage: 20 }),
      );
    });

    it('FR-3: maps a row to exactly the nine allowed response fields', async () => {
      const result = await service.listLogs({} as GetAdminLogsQueryDto);
      const item = result.data[0];

      expect(item).toEqual({
        id: 'log-uuid-1',
        user_id: 'user-uuid-1',
        user_name: 'Jane Doe',
        user_email: 'jane@example.com',
        action_type: AdminLogActionType.LOGIN,
        description: 'User logged in',
        ip_address: '102.89.33.21',
        created_at: new Date('2026-06-06T09:15:00.000Z'),
        status: AdminLogStatus.SUCCESS,
      });
      expect(Object.keys(item)).toHaveLength(9);
    });

    it('computes has_next true when more rows exist beyond the current page', async () => {
      mockAdminLogsListAction.findLogsWithFilters.mockResolvedValue([[makeRow()], 41]);

      const result = await service.listLogs({ page: 2, per_page: 20 } as GetAdminLogsQueryDto);

      expect(result.meta).toEqual({ total: 41, page: 2, per_page: 20, has_next: true });
    });

    // --- Filters (AC-02 to AC-05) ---

    it('AC-02: forwards the action_type filter to the list action', async () => {
      await service.listLogs({ action_type: AdminLogActionType.SIGNUP } as GetAdminLogsQueryDto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: AdminLogActionType.SIGNUP }),
      );
    });

    it('AC-03: forwards the status filter to the list action', async () => {
      await service.listLogs({ status: AdminLogStatus.FAILED } as GetAdminLogsQueryDto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ status: AdminLogStatus.FAILED }),
      );
    });

    it('AC-04: forwards the search term to the list action', async () => {
      await service.listLogs({ search: 'jane' } as GetAdminLogsQueryDto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'jane' }),
      );
    });

    it('AC-05: converts date_from and date_to into Date bounds', async () => {
      const dto = {
        date_from: '2026-06-01T00:00:00.000Z',
        date_to: '2026-06-04T12:30:00.000Z',
      } as GetAdminLogsQueryDto;

      await service.listLogs(dto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: new Date('2026-06-01T00:00:00.000Z'),
          dateTo: new Date('2026-06-04T12:30:00.000Z'),
        }),
      );
    });

    it('AC-05: widens a date-only date_to to the end of that day', async () => {
      await service.listLogs({ date_to: '2026-06-04' } as GetAdminLogsQueryDto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ dateTo: new Date('2026-06-04T23:59:59.999Z') }),
      );
    });

    // --- EC-03: per_page capping ---

    it('EC-03: silently caps per_page above 50 and flags meta.capped', async () => {
      const result = await service.listLogs({ per_page: 1000 } as GetAdminLogsQueryDto);

      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ perPage: 50 }),
      );
      expect(result.meta.per_page).toBe(50);
      expect(result.meta.capped).toBe(true);
    });

    it('EC-03: omits meta.capped when per_page is within the limit', async () => {
      const result = await service.listLogs({ per_page: 50 } as GetAdminLogsQueryDto);

      expect(result.meta.per_page).toBe(50);
      expect(result.meta).not.toHaveProperty('capped');
    });

    // --- EC-04: inverted date range ---

    it('EC-04: throws 422 before querying when date_from is after date_to', async () => {
      const dto = { date_from: '2026-06-10', date_to: '2026-06-01' } as GetAdminLogsQueryDto;

      await expect(service.listLogs(dto)).rejects.toThrow(
        new UnprocessableEntityException(SYS_MSG.ADMIN_LOGS_INVALID_DATE_RANGE),
      );
      expect(mockAdminLogsListAction.findLogsWithFilters).not.toHaveBeenCalled();
    });

    it('EC-04: accepts date_from equal to date_to', async () => {
      const dto = { date_from: '2026-06-01', date_to: '2026-06-01' } as GetAdminLogsQueryDto;

      await expect(service.listLogs(dto)).resolves.toBeDefined();
      expect(mockAdminLogsListAction.findLogsWithFilters).toHaveBeenCalled();
    });

    // --- EC-01 / AC-08: deleted user entries ---

    it('AC-08: maps a null user join to Deleted User with a null email', async () => {
      const row = makeRow({ log_user_id: null, user_full_name: null, user_email: null });
      mockAdminLogsListAction.findLogsWithFilters.mockResolvedValue([[row], 1]);

      const result = await service.listLogs({} as GetAdminLogsQueryDto);

      expect(result.data[0].user_name).toBe('Deleted User');
      expect(result.data[0].user_email).toBeNull();
      expect(result.data[0].user_id).toBeNull();
    });

    it('AC-08: soft-deleted user (user_id kept, join empty) also displays Deleted User', async () => {
      const row = makeRow({ user_full_name: null, user_email: null });
      mockAdminLogsListAction.findLogsWithFilters.mockResolvedValue([[row], 1]);

      const result = await service.listLogs({} as GetAdminLogsQueryDto);

      expect(result.data[0].user_name).toBe('Deleted User');
      expect(result.data[0].user_id).toBe('user-uuid-1');
    });
  });
});
