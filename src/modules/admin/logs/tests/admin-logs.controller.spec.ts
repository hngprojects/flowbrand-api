import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as SYS_MSG from '../../../../constants/system.messages';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import { AdminLogsController } from '../admin-logs.controller';
import { AdminLogsService } from '../admin-logs.service';
import { GetAdminLogsQueryDto } from '../dto/get-admin-logs-query.dto';
import { AdminLogActionType, AdminLogStatus } from '../enums/admin-log.enum';

const MOCK_LIST_RESPONSE = {
  data: [
    {
      id: 'log-uuid-1',
      user_id: 'user-uuid-1',
      user_name: 'Jane Doe',
      user_email: 'jane@example.com',
      action_type: AdminLogActionType.LOGIN,
      description: 'User logged in',
      ip_address: '102.89.33.21',
      created_at: new Date('2026-06-06T09:15:00.000Z'),
      status: AdminLogStatus.SUCCESS,
    },
  ],
  meta: { total: 1, page: 1, per_page: 20, has_next: false },
};

const mockAdminLogsService = { listLogs: jest.fn() };

describe('AdminLogsController', () => {
  let controller: AdminLogsController;
  let service: AdminLogsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAdminLogsService.listLogs.mockResolvedValue(MOCK_LIST_RESPONSE);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminLogsController],
      providers: [{ provide: AdminLogsService, useValue: mockAdminLogsService }],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AdminLogsController>(AdminLogsController);
    service = module.get<AdminLogsService>(AdminLogsService);
  });

  describe('listLogs', () => {
    it('AC-01: calls service.listLogs with the query DTO', async () => {
      const query = {
        action_type: AdminLogActionType.LOGIN,
        status: AdminLogStatus.SUCCESS,
        page: 1,
        per_page: 20,
      } as GetAdminLogsQueryDto;

      await controller.listLogs(query);

      expect(service.listLogs).toHaveBeenCalledWith(query);
    });

    it('AC-01: wraps the service result in the statusCode/message/data envelope', async () => {
      const result = await controller.listLogs({} as GetAdminLogsQueryDto);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.ADMIN_LOGS_RETRIEVED,
        data: MOCK_LIST_RESPONSE,
      });
    });

    it('AC-06: the route is protected by AdminJwtGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        AdminLogsController.prototype.listLogs,
      ) as unknown[];

      expect(guards).toContain(AdminJwtGuard);
    });
  });
});
