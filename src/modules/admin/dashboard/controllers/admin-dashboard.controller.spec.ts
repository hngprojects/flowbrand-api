import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AdminDashboardController } from '../controllers/admin-dashboard.controller';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import * as SYS_MSG from '../../../../constants/system.messages';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let service: AdminDashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [
        {
          provide: AdminDashboardService,
          useValue: {
            getStats: jest.fn().mockResolvedValue({ totalUsers: 1, activeUsers: 0, totalFunnelsGenerated: 0, funnelsThisWeek: 0 }),
            getWeeklyOverview: jest.fn().mockResolvedValue([]),
            getUserSegments: jest.fn().mockResolvedValue([]),
            getFunnelPerformance: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    })
      // Override the guard so we don't need to provide all of its dependencies
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AdminDashboardController>(AdminDashboardController);
    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return stats payload', async () => {
    const result = await controller.getStats();
    expect(service.getStats).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_STATS_RETRIEVED,
      data: { totalUsers: 1, activeUsers: 0, totalFunnelsGenerated: 0, funnelsThisWeek: 0 },
    });
  });

  it('should return weekly overview payload', async () => {
    const result = await controller.getWeeklyOverview();
    expect(service.getWeeklyOverview).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_WEEKLY_OVERVIEW_RETRIEVED,
      data: [],
    });
  });

  it('should return user segments payload', async () => {
    const result = await controller.getUserSegments();
    expect(service.getUserSegments).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_SEGMENTS_RETRIEVED,
      data: [],
    });
  });

  it('should return funnel performance payload', async () => {
    const result = await controller.getFunnelPerformance();
    expect(service.getFunnelPerformance).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_FUNNEL_PERFORMANCE_RETRIEVED,
      data: [],
    });
  });
});