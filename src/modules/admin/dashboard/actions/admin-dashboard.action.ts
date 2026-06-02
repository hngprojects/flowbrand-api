import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { Funnel } from '../../../funnels/entities/funnel.entity';
import { FunnelStage } from '../../../funnels/entities/funnel-stage.entity';
import { 
  CountResult, 
  SegmentResult, 
  StageCountResult, 
  GroupedStageAccumulator, 
  WeeklyOverviewItem,
} from '../interfaces/admin-dashboard.interface';

@Injectable()
export class AdminDashboardAction {
  constructor(private readonly manager: EntityManager) {}

  async getDashboardStats() {
    const totalUsers = await this.manager.getRepository(User).count();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await this.manager
      .createQueryBuilder(User, 'user')
      .innerJoin('user.auth_metadata', 'auth')
      .where('auth.last_login_at > :date', { date: thirtyDaysAgo })
      .getCount();

    const totalFunnelsGenerated = await this.manager
      .createQueryBuilder(Funnel, 'funnel')
      .where('funnel.status IN (:...statuses)', { statuses: ['active', 'failed'] })
      .getCount();

    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const funnelsThisWeek = await this.manager
      .createQueryBuilder(Funnel, 'funnel')
      .where('funnel.created_at >= :startOfWeek', { startOfWeek })
      .getCount();

    return {
      totalUsers,
      activeUsers,
      totalFunnelsGenerated,
      funnelsThisWeek,
    };
  }

  async getWeeklyOverview() {
    const startOfRange = new Date();
    startOfRange.setDate(startOfRange.getDate() - 6);
    startOfRange.setHours(0, 0, 0, 0);

    const userCounts = await this.manager
      .createQueryBuilder(User, 'user')
      .select("DATE_TRUNC('day', user.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.created_at >= :startOfRange', { startOfRange })
      .groupBy("DATE_TRUNC('day', user.created_at)")
      .getRawMany<CountResult>();

    const funnelCounts = await this.manager
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

  async getUserSegments() {
    const result = await this.manager
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
        percentage = 100 - runningPercentage;
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
    const result = await this.manager
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
      if (curr.status === 'complete') {
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
}