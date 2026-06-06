import { Injectable, Logger } from '@nestjs/common';
import { AdminDashboardAction } from '../actions/admin-dashboard.action';
import { RedisService } from '../../../redis/redis.service';
import { redisKeys } from '../../../../constants/redis-keys';
import {
  DashboardStats,
  FunnelPerformanceItem,
  RetentionBandItem,
  UserSegmentItem,
  UserStageItem,
  WeeklyOverviewItem,
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

  /** Returns headline platform KPIs (including plan distribution), serving from a 5-minute Redis cache on hit. */
  async getStats(): Promise<DashboardStats> {
    return this.getCachedOrFetch<DashboardStats>(
      redisKeys.adminDashboardStats(),
      () => this.adminDashboardAction.getDashboardStats(),
    );
  }

  /**
   * Returns daily or weekly chart data.
   *
   * @param period `'7d'` — 7 daily buckets (default). `'12w'` — 12 ISO-week buckets.
   * Each period variant is cached under its own Redis key so they do not evict each other.
   */
  async getWeeklyOverview(period: '7d' | '12w' = '7d'): Promise<WeeklyOverviewItem[]> {
    const cacheKey =
      period === '12w'
        ? redisKeys.adminDashboardWeeklyOverview12w()
        : redisKeys.adminDashboardWeeklyOverview7d();

    return this.getCachedOrFetch<WeeklyOverviewItem[]>(
      cacheKey,
      () => this.adminDashboardAction.getWeeklyOverview(period),
    );
  }

  /** Returns business-type groupings with percentage distributions summing to 100. */
  async getUserSegments(): Promise<UserSegmentItem[]> {
    return this.getCachedOrFetch<UserSegmentItem[]>(
      redisKeys.adminDashboardUserSegments(),
      () => this.adminDashboardAction.getUserSegments(),
    );
  }

  /** Returns completion rates per funnel stage position across all platform funnels. */
  async getFunnelPerformance(): Promise<FunnelPerformanceItem[]> {
    return this.getCachedOrFetch<FunnelPerformanceItem[]>(
      redisKeys.adminDashboardFunnelPerformance(),
      () => this.adminDashboardAction.getFunnelPerformance(),
    );
  }

  /** Returns lifecycle stage counts from signed-up through to stage 3 active, served from a 5-minute Redis cache. */
  async getUserStages(): Promise<UserStageItem[]> {
    return this.getCachedOrFetch<UserStageItem[]>(
      redisKeys.adminDashboardUserStages(),
      () => this.adminDashboardAction.getUserStages(),
    );
  }

  /** Returns four retention cohort bands bucketed by account age, served from a 5-minute Redis cache. */
  async getUserRetention(): Promise<RetentionBandItem[]> {
    return this.getCachedOrFetch<RetentionBandItem[]>(
      redisKeys.adminDashboardUserRetention(),
      () => this.adminDashboardAction.getUserRetention(),
    );
  }
}