import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AdminDashboardController } from '../controllers/admin-dashboard.controller';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import * as SYS_MSG from '../../../../constants/system.messages';
import { WeeklyOverviewQueryDto } from '../dtos/admin-dashboard.dto';

const MOCK_STATS = {
  totalUsers: 1,
  activeUsers: 0,
  totalFunnelsGenerated: 0,
  funnelsThisWeek: 0,
  planDistribution: { free: 1, pro: 0 },
};

const MOCK_USER_STAGES = [
  { stage: 'signedUp', label: 'Signed up', count: 184 },
  { stage: 'intakeDone', label: 'Intake done', count: 14 },
  { stage: 'createdStrategies', label: 'Created strategies', count: 20 },
  { stage: 'stage1Active', label: 'Stage 1 active', count: 42 },
  { stage: 'stage2Active', label: 'Stage 2 active', count: 142 },
  { stage: 'stage3Active', label: 'Stage 3 active', count: 138 },
];

const MOCK_USER_RETENTION = [
  { band: 'lessThan1Week', label: '< 1 week', count: 184 },
  { band: '1To4Weeks', label: '1–4 weeks', count: 93 },
  { band: '1To3Months', label: '1–3 months', count: 64 },
  { band: 'over3Months', label: '3+ months', count: 42 },
];

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
            getStats: jest.fn().mockResolvedValue(MOCK_STATS),
            getWeeklyOverview: jest.fn().mockResolvedValue([]),
            getUserSegments: jest.fn().mockResolvedValue([]),
            getFunnelPerformance: jest.fn().mockResolvedValue([]),
            getUserStages: jest.fn().mockResolvedValue(MOCK_USER_STAGES),
            getUserRetention: jest.fn().mockResolvedValue(MOCK_USER_RETENTION),
          },
        },
      ],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AdminDashboardController>(AdminDashboardController);
    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getStats
  // ---------------------------------------------------------------------------

  it('should return stats payload including planDistribution', async () => {
    const result = await controller.getStats();
    expect(service.getStats).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_STATS_RETRIEVED,
      data: MOCK_STATS,
    });
    expect(result.data.planDistribution).toEqual({ free: 1, pro: 0 });
  });

  // ---------------------------------------------------------------------------
  // getWeeklyOverview
  // ---------------------------------------------------------------------------

  it('should return weekly overview payload for default period (7d)', async () => {
    const query: WeeklyOverviewQueryDto = { period: '7d' };
    const result = await controller.getWeeklyOverview(query);
    expect(service.getWeeklyOverview).toHaveBeenCalledWith('7d');
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_WEEKLY_OVERVIEW_RETRIEVED,
      data: [],
    });
  });

  it('should pass period=12w to service when queried', async () => {
    const query: WeeklyOverviewQueryDto = { period: '12w' };
    await controller.getWeeklyOverview(query);
    expect(service.getWeeklyOverview).toHaveBeenCalledWith('12w');
  });

  it('should return weekly overview payload for period=12w', async () => {
    (service.getWeeklyOverview as jest.Mock).mockResolvedValueOnce([
      { date: '2026-03-24', newUsers: 41, funnelsGenerated: 18 },
    ]);
    const query: WeeklyOverviewQueryDto = { period: '12w' };
    const result = await controller.getWeeklyOverview(query);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({ date: '2026-03-24', newUsers: 41, funnelsGenerated: 18 });
  });

  // ---------------------------------------------------------------------------
  // getUserSegments
  // ---------------------------------------------------------------------------

  it('should return user segments payload', async () => {
    const result = await controller.getUserSegments();
    expect(service.getUserSegments).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_SEGMENTS_RETRIEVED,
      data: [],
    });
  });

  // ---------------------------------------------------------------------------
  // getFunnelPerformance
  // ---------------------------------------------------------------------------

  it('should return funnel performance payload', async () => {
    const result = await controller.getFunnelPerformance();
    expect(service.getFunnelPerformance).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_FUNNEL_PERFORMANCE_RETRIEVED,
      data: [],
    });
  });

  // ---------------------------------------------------------------------------
  // getUserStages
  // ---------------------------------------------------------------------------

  it('should return user stages payload', async () => {
    const result = await controller.getUserStages();
    expect(service.getUserStages).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_STAGES_RETRIEVED,
      data: MOCK_USER_STAGES,
    });
  });

  it('getUserStages payload should contain six items', async () => {
    const result = await controller.getUserStages();
    expect(result.data).toHaveLength(6);
  });

  it('getUserStages payload first item should be signedUp stage', async () => {
    const result = await controller.getUserStages();
    expect(result.data[0].stage).toBe('signedUp');
  });

  // ---------------------------------------------------------------------------
  // getUserRetention
  // ---------------------------------------------------------------------------

  it('should return user retention payload', async () => {
    const result = await controller.getUserRetention();
    expect(service.getUserRetention).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_RETENTION_RETRIEVED,
      data: MOCK_USER_RETENTION,
    });
  });

  it('getUserRetention payload should contain four items', async () => {
    const result = await controller.getUserRetention();
    expect(result.data).toHaveLength(4);
  });

  it('getUserRetention payload bands should be in correct order', async () => {
    const result = await controller.getUserRetention();
    const bands = result.data.map((r) => r.band);
    expect(bands).toEqual(['lessThan1Week', '1To4Weeks', '1To3Months', 'over3Months']);
  });
});