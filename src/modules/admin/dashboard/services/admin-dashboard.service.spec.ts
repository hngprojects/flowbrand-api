import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminDashboardAction } from '../actions/admin-dashboard.action';
import { RedisService } from '../../../redis/redis.service';

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
            getDashboardStats: jest.fn().mockResolvedValue({ totalUsers: 10, activeUsers: 5, totalFunnelsGenerated: 2, funnelsThisWeek: 1 }),
            getWeeklyOverview: jest.fn().mockResolvedValue([{ date: '2026-06-02', newUsers: 2, funnelsGenerated: 1 }]),
            getUserSegments: jest.fn().mockResolvedValue([{ label: 'B2B', count: 10, percentage: 100 }]),
            getFunnelPerformance: jest.fn().mockResolvedValue([{ stagePosition: 1, stageName: 'Awareness', completionRate: 50 }]),
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

  it('should call action and set cache if miss for getStats', async () => {
    const result = await service.getStats();
    expect(action.getDashboardStats).toHaveBeenCalled();
    expect(redisService.get).toHaveBeenCalled();
    expect(redisService.set).toHaveBeenCalled();
    expect(result).toEqual({ totalUsers: 10, activeUsers: 5, totalFunnelsGenerated: 2, funnelsThisWeek: 1 });
  });

  it('should return from cache if hit for getStats', async () => {
    (redisService.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ totalUsers: 99 }));
    const result = await service.getStats();
    expect(action.getDashboardStats).not.toHaveBeenCalled();
    expect(result).toEqual({ totalUsers: 99 });
  });

  // Coverage tests for the other endpoints
  it('should call getWeeklyOverview', async () => {
    const result = await service.getWeeklyOverview();
    expect(action.getWeeklyOverview).toHaveBeenCalled();
    expect(result.length).toEqual(1);
  });

  it('should call getUserSegments', async () => {
    const result = await service.getUserSegments();
    expect(action.getUserSegments).toHaveBeenCalled();
    expect(result[0].percentage).toEqual(100);
  });

  it('should call getFunnelPerformance', async () => {
    const result = await service.getFunnelPerformance();
    expect(action.getFunnelPerformance).toHaveBeenCalled();
    expect(result[0].completionRate).toEqual(50);
  });
});