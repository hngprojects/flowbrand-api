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

  private async getCachedOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.redisService.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      this.logger.warn(`Redis get/parse failed for key ${key}: ${(err as Error).message}`);
    }

    const data = await fetcher();

    try {
      await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    } catch (err) {
      this.logger.warn(`Redis set failed for key ${key}: ${(err as Error).message}`);
    }

    return data;
  }

  /** Returns headline platform KPIs, serving from a 5-minute Redis cache on hit. */
  async getStats(): Promise<DashboardStats> {
    return this.getCachedOrFetch<DashboardStats>(
      redisKeys.adminDashboardStats(),
      () => this.adminDashboardAction.getDashboardStats()
    );
  }

  /** Returns 7 daily data points charting new users and funnels over the last week. */
  async getWeeklyOverview(): Promise<WeeklyOverviewItem[]> {
    return this.getCachedOrFetch<WeeklyOverviewItem[]>(
      redisKeys.adminDashboardWeeklyOverview(),
      () => this.adminDashboardAction.getWeeklyOverview()
    );
  }

  /** Returns business-type groupings with percentage distributions summing to 100. */
  async getUserSegments(): Promise<UserSegmentItem[]> {
    return this.getCachedOrFetch<UserSegmentItem[]>(
      redisKeys.adminDashboardUserSegments(),
      () => this.adminDashboardAction.getUserSegments()
    );
  }

  /** Returns completion rates per funnel stage position across all platform funnels. */
  async getFunnelPerformance(): Promise<FunnelPerformanceItem[]> {
    return this.getCachedOrFetch<FunnelPerformanceItem[]>(
      redisKeys.adminDashboardFunnelPerformance(),
      () => this.adminDashboardAction.getFunnelPerformance()
    );
  }
}