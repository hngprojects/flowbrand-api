import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminDashboardAction } from '../actions/admin-dashboard.action';
import { RedisService } from '../../../redis/redis.service';

const MOCK_STATS = {
  totalUsers: 10,
  activeUsers: 5,
  totalFunnelsGenerated: 2,
  funnelsThisWeek: 1,
  planDistribution: { free: 8, pro: 2 },
};

const MOCK_WEEKLY_7D = [{ date: '2026-06-02', newUsers: 2, funnelsGenerated: 1 }];
const MOCK_WEEKLY_12W = [{ date: '2026-03-24', newUsers: 41, funnelsGenerated: 18 }];

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

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let action: AdminDashboardAction;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        {
          provide: AdminDashboardAction,
          useValue: {
            getDashboardStats: jest.fn().mockResolvedValue(MOCK_STATS),
            getWeeklyOverview: jest
              .fn()
              .mockImplementation((period: '7d' | '12w' = '7d') =>
                Promise.resolve(period === '12w' ? MOCK_WEEKLY_12W : MOCK_WEEKLY_7D),
              ),
            getUserSegments: jest.fn().mockResolvedValue([{ label: 'B2B', count: 10, percentage: 100 }]),
            getFunnelPerformance: jest
              .fn()
              .mockResolvedValue([{ stagePosition: 1, stageName: 'Awareness', completionRate: 50 }]),
            getUserStages: jest.fn().mockResolvedValue(MOCK_USER_STAGES),
            getUserRetention: jest.fn().mockResolvedValue(MOCK_USER_RETENTION),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
    action = module.get<AdminDashboardAction>(AdminDashboardAction);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getStats
  // ---------------------------------------------------------------------------

  it('should call action and set cache if miss for getStats', async () => {
    const result = await service.getStats();
    expect(action.getDashboardStats).toHaveBeenCalled();
    expect(redisService.get).toHaveBeenCalled();
    expect(redisService.set).toHaveBeenCalled();
    expect(result).toEqual(MOCK_STATS);
  });

  it('should return from cache if hit for getStats', async () => {
    (redisService.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ totalUsers: 99, planDistribution: { free: 1, pro: 0 } }));
    const result = await service.getStats();
    expect(action.getDashboardStats).not.toHaveBeenCalled();
    expect(result).toEqual({ totalUsers: 99, planDistribution: { free: 1, pro: 0 } });
  });

  it('getStats result should include planDistribution', async () => {
    const result = await service.getStats();
    expect(result.planDistribution).toEqual({ free: 8, pro: 2 });
  });

  // ---------------------------------------------------------------------------
  // getWeeklyOverview — 7d (default)
  // ---------------------------------------------------------------------------

  it('should call getWeeklyOverview with period 7d by default', async () => {
    const result = await service.getWeeklyOverview();
    expect(action.getWeeklyOverview).toHaveBeenCalledWith('7d');
    expect(result).toEqual(MOCK_WEEKLY_7D);
  });

  it('should use the 7d-scoped Redis key for period=7d', async () => {
    await service.getWeeklyOverview('7d');
    const calledKey = (redisService.get as jest.Mock).mock.calls[0][0] as string;
    expect(calledKey).toBe('admin-dashboard:weekly-overview:7d');
  });

  // ---------------------------------------------------------------------------
  // getWeeklyOverview — 12w
  // ---------------------------------------------------------------------------

  it('should call getWeeklyOverview with period 12w', async () => {
    const result = await service.getWeeklyOverview('12w');
    expect(action.getWeeklyOverview).toHaveBeenCalledWith('12w');
    expect(result).toEqual(MOCK_WEEKLY_12W);
  });

  it('should use the 12w-scoped Redis key for period=12w', async () => {
    await service.getWeeklyOverview('12w');
    const calledKey = (redisService.get as jest.Mock).mock.calls[0][0] as string;
    expect(calledKey).toBe('admin-dashboard:weekly-overview:12w');
  });

  it('should return from cache if hit for getWeeklyOverview 12w', async () => {
    (redisService.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(MOCK_WEEKLY_12W));
    const result = await service.getWeeklyOverview('12w');
    expect(action.getWeeklyOverview).not.toHaveBeenCalled();
    expect(result).toEqual(MOCK_WEEKLY_12W);
  });

  // ---------------------------------------------------------------------------
  // getUserSegments
  // ---------------------------------------------------------------------------

  it('should call getUserSegments', async () => {
    const result = await service.getUserSegments();
    expect(action.getUserSegments).toHaveBeenCalled();
    expect(result[0].percentage).toEqual(100);
  });

  // ---------------------------------------------------------------------------
  // getFunnelPerformance
  // ---------------------------------------------------------------------------

  it('should call getFunnelPerformance', async () => {
    const result = await service.getFunnelPerformance();
    expect(action.getFunnelPerformance).toHaveBeenCalled();
    expect(result[0].completionRate).toEqual(50);
  });

  // ---------------------------------------------------------------------------
  // getUserStages
  // ---------------------------------------------------------------------------

  it('should call action and set cache if miss for getUserStages', async () => {
    const result = await service.getUserStages();
    expect(action.getUserStages).toHaveBeenCalled();
    expect(redisService.set).toHaveBeenCalled();
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ stage: 'signedUp', label: 'Signed up', count: 184 });
  });

  it('should return from cache if hit for getUserStages', async () => {
    (redisService.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([{ stage: 'signedUp', label: 'Signed up', count: 999 }]));
    const result = await service.getUserStages();
    expect(action.getUserStages).not.toHaveBeenCalled();
    expect(result[0].count).toBe(999);
  });

  it('getUserStages result should contain all six lifecycle stages', async () => {
    const result = await service.getUserStages();
    const stages = result.map((r) => r.stage);
    expect(stages).toEqual(['signedUp', 'intakeDone', 'createdStrategies', 'stage1Active', 'stage2Active', 'stage3Active']);
  });

  it('should use the correct Redis key for getUserStages', async () => {
    await service.getUserStages();
    const calledKey = (redisService.get as jest.Mock).mock.calls[0][0] as string;
    expect(calledKey).toBe('admin-dashboard:user-stages');
  });

  // ---------------------------------------------------------------------------
  // getUserRetention
  // ---------------------------------------------------------------------------

  it('should call action and set cache if miss for getUserRetention', async () => {
    const result = await service.getUserRetention();
    expect(action.getUserRetention).toHaveBeenCalled();
    expect(redisService.set).toHaveBeenCalled();
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ band: 'lessThan1Week', label: '< 1 week', count: 184 });
  });

  it('should return from cache if hit for getUserRetention', async () => {
    (redisService.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([{ band: 'lessThan1Week', label: '< 1 week', count: 777 }]));
    const result = await service.getUserRetention();
    expect(action.getUserRetention).not.toHaveBeenCalled();
    expect(result[0].count).toBe(777);
  });

  it('getUserRetention result should contain all four bands', async () => {
    const result = await service.getUserRetention();
    const bands = result.map((r) => r.band);
    expect(bands).toEqual(['lessThan1Week', '1To4Weeks', '1To3Months', 'over3Months']);
  });

  it('should use the correct Redis key for getUserRetention', async () => {
    await service.getUserRetention();
    const calledKey = (redisService.get as jest.Mock).mock.calls[0][0] as string;
    expect(calledKey).toBe('admin-dashboard:user-retention');
  });
});