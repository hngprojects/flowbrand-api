import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import * as SYS_MSG from '../../../../constants/system.messages';
import {
  DashboardStats,
  FunnelPerformanceItem,
  RetentionBandItem,
  UserSegmentItem,
  UserStageItem,
  WeeklyOverviewItem,
} from '../interfaces/admin-dashboard.interface';
import { WeeklyOverviewQueryDto } from '../dtos/admin-dashboard.dto';
import {
  GetFunnelPerformanceDocs,
  GetStatsDocs,
  GetUserRetentionDocs,
  GetUserSegmentsDocs,
  GetUserStagesDocs,
  GetWeeklyOverviewDocs,
} from '../docs/admin-dashboard-swagger.doc';

@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(AdminJwtGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('stats')
  @GetStatsDocs()
  async getStats(): Promise<{ statusCode: number; message: string; data: DashboardStats }> {
    const data = await this.dashboardService.getStats();
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_STATS_RETRIEVED,
      data,
    };
  }

  @Get('weekly-overview')
  @GetWeeklyOverviewDocs()
  async getWeeklyOverview(
    @Query() query: WeeklyOverviewQueryDto,
  ): Promise<{ statusCode: number; message: string; data: WeeklyOverviewItem[] }> {
    const data = await this.dashboardService.getWeeklyOverview(query.period);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_WEEKLY_OVERVIEW_RETRIEVED,
      data,
    };
  }

  @Get('user-segments')
  @GetUserSegmentsDocs()
  async getUserSegments(): Promise<{ statusCode: number; message: string; data: UserSegmentItem[] }> {
    const data = await this.dashboardService.getUserSegments();
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_SEGMENTS_RETRIEVED,
      data,
    };
  }

  @Get('funnel-performance')
  @GetFunnelPerformanceDocs()
  async getFunnelPerformance(): Promise<{ statusCode: number; message: string; data: FunnelPerformanceItem[] }> {
    const data = await this.dashboardService.getFunnelPerformance();
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_FUNNEL_PERFORMANCE_RETRIEVED,
      data,
    };
  }

  @Get('user-stages')
  @GetUserStagesDocs()
  async getUserStages(): Promise<{ statusCode: number; message: string; data: UserStageItem[] }> {
    const data = await this.dashboardService.getUserStages();
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_STAGES_RETRIEVED,
      data,
    };
  }

  @Get('user-retention')
  @GetUserRetentionDocs()
  async getUserRetention(): Promise<{ statusCode: number; message: string; data: RetentionBandItem[] }> {
    const data = await this.dashboardService.getUserRetention();
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.ADMIN_DASHBOARD_USER_RETENTION_RETRIEVED,
      data,
    };
  }
}