import { Injectable, Logger } from '@nestjs/common';
import { AdminDashboardAction } from '../actions/admin-dashboard.action';
import { RedisService } from '../../../redis/redis.service';
import { redisKeys } from '../../../../constants/redis-keys';
import { 
  DashboardStats, 
  WeeklyOverviewItem, 
  UserSegmentItem, 
  FunnelPerformanceItem 
} from '../interfaces/admin-dashboard.interface';

@Injectable()
export class AdminDashboardService {
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    private readonly adminDashboardAction: AdminDashboardAction,
    private readonly redisService: RedisService,
  ) {}

  async getStats(): Promise<DashboardStats> {
    const key = redisKeys.adminDashboardStats();
    const cached = await this.redisService.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached) as DashboardStats;
      } catch (err) {
        this.logger.warn(`Failed to parse cache for key ${key}: ${(err as Error).message}`);
      }
    }

    const data = await this.adminDashboardAction.getDashboardStats();
    await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    
    return data;
  }

  async getWeeklyOverview(): Promise<WeeklyOverviewItem[]> {
    const key = redisKeys.adminDashboardWeeklyOverview();
    const cached = await this.redisService.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached) as WeeklyOverviewItem[];
      } catch (err) {
        this.logger.warn(`Failed to parse cache for key ${key}: ${(err as Error).message}`);
      }
    }

    const data = await this.adminDashboardAction.getWeeklyOverview();
    await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    
    return data;
  }

  async getUserSegments(): Promise<UserSegmentItem[]> {
    const key = redisKeys.adminDashboardUserSegments();
    const cached = await this.redisService.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached) as UserSegmentItem[];
      } catch (err) {
        this.logger.warn(`Failed to parse cache for key ${key}: ${(err as Error).message}`);
      }
    }

    const data = await this.adminDashboardAction.getUserSegments();
    await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    
    return data;
  }

  async getFunnelPerformance(): Promise<FunnelPerformanceItem[]> {
    const key = redisKeys.adminDashboardFunnelPerformance();
    const cached = await this.redisService.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached) as FunnelPerformanceItem[];
      } catch (err) {
        this.logger.warn(`Failed to parse cache for key ${key}: ${(err as Error).message}`);
      }
    }

    const data = await this.adminDashboardAction.getFunnelPerformance();
    await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    
    return data;
  }
}