import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { User } from '../../../users/entities/user.entity';
import { Funnel } from '../../../funnels/entities/funnel.entity';
import { FunnelStage } from '../../../funnels/entities/funnel-stage.entity';
import { StageStatus } from '../../../funnels/enums/stage-status.enum';
import { FunnelStatus } from '../../../funnels/enums/funnel-status.enum';
import { UserPlan } from '../../../users/enums/user-plan.enum';
import { UserModelAction } from '../../../users/actions/user.action';
import {
  CountResult,
  DashboardStats,
  GroupedStageAccumulator,
  PlanCountResult,
  RetentionBandItem,
  SegmentResult,
  StageCountResult,
  UserStageItem,
  WeeklyOverviewItem,
} from '../interfaces/admin-dashboard.interface';

@Injectable()
export class AdminDashboardAction {
  constructor(
    private readonly userModelAction: UserModelAction,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getDashboardStats(): Promise<DashboardStats> {
    const userResult = await this.userModelAction.list({ paginationPayload: { page: 1, limit: 1 } });
    const totalUsers = userResult.paginationMeta?.total ?? 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await this.dataSource
      .createQueryBuilder(User, 'user')
      .innerJoin('user.auth_metadata', 'auth')
      .where('auth.last_login_at > :date', { date: thirtyDaysAgo })
      .getCount();

    const totalFunnelsGenerated = await this.dataSource
      .createQueryBuilder(Funnel, 'funnel')
      .where('funnel.status IN (:...statuses)', { statuses: [FunnelStatus.ACTIVE, FunnelStatus.FAILED] })
      .getCount();

    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const funnelsThisWeek = await this.dataSource
      .createQueryBuilder(Funnel, 'funnel')
      .where('funnel.created_at >= :startOfWeek', { startOfWeek })
      .getCount();

    const planRows = await this.dataSource
      .createQueryBuilder(User, 'user')
      .select('user.plan', 'plan')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.plan')
      .getRawMany<PlanCountResult>();

    const planDistribution = { free: 0, pro: 0 };
    for (const row of planRows) {
      if (row.plan === UserPlan.FREE) planDistribution.free = parseInt(row.count, 10);
      if (row.plan === UserPlan.PRO) planDistribution.pro = parseInt(row.count, 10);
    }

    return {
      totalUsers,
      activeUsers,
      totalFunnelsGenerated,
      funnelsThisWeek,
      planDistribution,
    };
  }

  async getWeeklyOverview(period: '7d' | '12w' = '7d'): Promise<WeeklyOverviewItem[]> {
    if (period === '12w') {
      return this.getTwelveWeekOverview();
    }
    return this.getSevenDayOverview();
  }

  private async getSevenDayOverview(): Promise<WeeklyOverviewItem[]> {
    const startOfRange = new Date();
    startOfRange.setDate(startOfRange.getDate() - 6);
    startOfRange.setHours(0, 0, 0, 0);

    const userCounts = await this.dataSource
      .createQueryBuilder(User, 'user')
      .select("DATE_TRUNC('day', user.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.created_at >= :startOfRange', { startOfRange })
      .groupBy("DATE_TRUNC('day', user.created_at)")
      .getRawMany<CountResult>();

    const funnelCounts = await this.dataSource
      .createQueryBuilder(Funnel, 'funnel')
      .select("DATE_TRUNC('day', funnel.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('funnel.created_at >= :startOfRange', { startOfRange })
      .groupBy("DATE_TRUNC('day', funnel.created_at)")
      .getRawMany<CountResult>();

    const overview: WeeklyOverviewItem[] = [];
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      const dateString = targetDate.toISOString().split('T')[0];

      const uMatch = userCounts.find((u) => {
        const d = new Date(u.date);
        return d.toISOString().split('T')[0] === dateString;
      });

      const fMatch = funnelCounts.find((f) => {
        const d = new Date(f.date);
        return d.toISOString().split('T')[0] === dateString;
      });

      overview.push({
        date: dateString,
        newUsers: uMatch ? parseInt(uMatch.count, 10) : 0,
        funnelsGenerated: fMatch ? parseInt(fMatch.count, 10) : 0,
      });
    }

    return overview;
  }

  private async getTwelveWeekOverview(): Promise<WeeklyOverviewItem[]> {
    // Start of the current ISO week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setDate(now.getDate() + diffToMonday);
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    // 12 weeks back from the start of the current week
    const startOfRange = new Date(startOfCurrentWeek);
    startOfRange.setDate(startOfCurrentWeek.getDate() - 11 * 7);

    const userCounts = await this.dataSource
      .createQueryBuilder(User, 'user')
      .select("DATE_TRUNC('week', user.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.created_at >= :startOfRange', { startOfRange })
      .groupBy("DATE_TRUNC('week', user.created_at)")
      .getRawMany<CountResult>();

    const funnelCounts = await this.dataSource
      .createQueryBuilder(Funnel, 'funnel')
      .select("DATE_TRUNC('week', funnel.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('funnel.created_at >= :startOfRange', { startOfRange })
      .groupBy("DATE_TRUNC('week', funnel.created_at)")
      .getRawMany<CountResult>();

    const overview: WeeklyOverviewItem[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(startOfCurrentWeek);
      weekStart.setDate(startOfCurrentWeek.getDate() - i * 7);
      const dateString = weekStart.toISOString().split('T')[0];

      const uMatch = userCounts.find((u) => {
        const d = new Date(u.date);
        return d.toISOString().split('T')[0] === dateString;
      });

      const fMatch = funnelCounts.find((f) => {
        const d = new Date(f.date);
        return d.toISOString().split('T')[0] === dateString;
      });

      overview.push({
        date: dateString,
        newUsers: uMatch ? parseInt(uMatch.count, 10) : 0,
        funnelsGenerated: fMatch ? parseInt(fMatch.count, 10) : 0,
      });
    }

    return overview;
  }

  async getUserSegments() {
    const result = await this.dataSource
      .createQueryBuilder(User, 'user')
      .select('user.business_type', 'label')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.business_type')
      .getRawMany<SegmentResult>();

    const totalCount = result.reduce((sum, row) => sum + parseInt(row.count, 10), 0);

    if (totalCount === 0) return [];

    const processedSegments = result.map((row) => ({
      label: row.label || 'Not specified',
      count: parseInt(row.count, 10),
    }));

    const groupedSegments = processedSegments.reduce((acc: Record<string, number>, curr) => {
      acc[curr.label] = (acc[curr.label] || 0) + curr.count;
      return acc;
    }, {});

    const finalSegments = Object.entries(groupedSegments).map(([label, count]) => ({ label, count }));

    let runningPercentage = 0;
    return finalSegments.map((segment, index) => {
      let percentage = Math.round((segment.count / totalCount) * 100);

      if (index === finalSegments.length - 1) {
        percentage = Math.max(0, 100 - runningPercentage);
      } else {
        runningPercentage += percentage;
      }

      return {
        label: segment.label,
        count: segment.count,
        percentage,
      };
    });
  }

  async getFunnelPerformance() {
    const result = await this.dataSource
      .createQueryBuilder(FunnelStage, 'stage')
      .select('stage.position', 'position')
      .addSelect('MAX(stage.name)', 'name')
      .addSelect('stage.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('stage.position')
      .addGroupBy('stage.status')
      .orderBy('stage.position', 'ASC')
      .getRawMany<StageCountResult>();

    const grouped = result.reduce((acc: Record<number, GroupedStageAccumulator>, curr) => {
      const pos = curr.position;
      if (!acc[pos]) {
        acc[pos] = { position: pos, name: curr.name, total: 0, completed: 0 };
      }

      const cnt = parseInt(curr.count, 10);
      acc[pos].total += cnt;
      if (curr.status === StageStatus.COMPLETE) {
        acc[pos].completed += cnt;
      }
      return acc;
    }, {});

    return Object.values(grouped).map((group) => {
      const completionRate = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;
      return {
        stagePosition: group.position,
        stageName: group.name,
        completionRate,
      };
    });
  }

  async getUserStages(): Promise<UserStageItem[]> {
    const signedUp = await this.dataSource
      .createQueryBuilder(User, 'user')
      .getCount();

    const intakeDone = await this.dataSource
      .createQueryBuilder(User, 'user')
      .where('user.business_type IS NOT NULL')
      .andWhere('user.target_customer IS NOT NULL')
      .andWhere('user.primary_goal IS NOT NULL')
      .getCount();

    const createdStrategies = await this.dataSource
      .createQueryBuilder(User, 'user')
      .innerJoin(
        Funnel,
        'funnel',
        'funnel.user_id = user.id AND funnel.status IN (:...statuses)',
        { statuses: [FunnelStatus.ACTIVE, FunnelStatus.FAILED] },
      )
      .getCount();

    const stage1Active = await this.dataSource
      .createQueryBuilder(User, 'user')
      .innerJoin(
        FunnelStage,
        'stage',
        'stage.funnel_id IN (SELECT id FROM funnels WHERE user_id = user.id) AND stage.position = :pos AND stage.status IN (:...stageStatuses)',
        { pos: 1, stageStatuses: [StageStatus.ACTIVE, StageStatus.COMPLETE] },
      )
      .getCount();

    const stage2Active = await this.dataSource
      .createQueryBuilder(User, 'user')
      .innerJoin(
        FunnelStage,
        'stage',
        'stage.funnel_id IN (SELECT id FROM funnels WHERE user_id = user.id) AND stage.position = :pos AND stage.status IN (:...stageStatuses)',
        { pos: 2, stageStatuses: [StageStatus.ACTIVE, StageStatus.COMPLETE] },
      )
      .getCount();

    const stage3Active = await this.dataSource
      .createQueryBuilder(User, 'user')
      .innerJoin(
        FunnelStage,
        'stage',
        'stage.funnel_id IN (SELECT id FROM funnels WHERE user_id = user.id) AND stage.position = :pos AND stage.status IN (:...stageStatuses)',
        { pos: 3, stageStatuses: [StageStatus.ACTIVE, StageStatus.COMPLETE] },
      )
      .getCount();

    return [
      { stage: 'signedUp', label: 'Signed up', count: signedUp },
      { stage: 'intakeDone', label: 'Intake done', count: intakeDone },
      { stage: 'createdStrategies', label: 'Created strategies', count: createdStrategies },
      { stage: 'stage1Active', label: 'Stage 1 active', count: stage1Active },
      { stage: 'stage2Active', label: 'Stage 2 active', count: stage2Active },
      { stage: 'stage3Active', label: 'Stage 3 active', count: stage3Active },
    ];
  }

  async getUserRetention(): Promise<RetentionBandItem[]> {
    const now = new Date();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const twentyEightDaysAgo = new Date(now);
    twentyEightDaysAgo.setDate(now.getDate() - 28);

    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(now.getDate() - 90);

    // All bands use ">= lower AND < upper" so each boundary timestamp
    // falls into exactly one bucket with no double-counting.
    const lessThan1Week = await this.dataSource
      .createQueryBuilder(User, 'user')
      .where('user.created_at > :date', { date: sevenDaysAgo })
      .getCount();

    const oneToFourWeeks = await this.dataSource
      .createQueryBuilder(User, 'user')
      .where('user.created_at >= :from AND user.created_at <= :to', {
        from: twentyEightDaysAgo,
        to: sevenDaysAgo,
      })
      .getCount();

    const oneToThreeMonths = await this.dataSource
      .createQueryBuilder(User, 'user')
      .where('user.created_at >= :from AND user.created_at < :to', {
        from: ninetyDaysAgo,
        to: twentyEightDaysAgo,
      })
      .getCount();

    const over3Months = await this.dataSource
      .createQueryBuilder(User, 'user')
      .where('user.created_at < :date', { date: ninetyDaysAgo })
      .getCount();

    return [
      { band: 'lessThan1Week', label: '< 1 week', count: lessThan1Week },
      { band: '1To4Weeks', label: '1–4 weeks', count: oneToFourWeeks },
      { band: '1To3Months', label: '1–3 months', count: oneToThreeMonths },
      { band: 'over3Months', label: '3+ months', count: over3Months },
    ];
  }
}