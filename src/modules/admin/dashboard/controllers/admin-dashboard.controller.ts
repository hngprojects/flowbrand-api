import { Controller, Get, UseGuards, HttpStatus } from '@nestjs/common';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminJwtGuard } from '../../../auth/guards/admin-jwt.guard';
import * as SYS_MSG from '../../../../constants/system.messages';
import { 
  DashboardStats, 
  WeeklyOverviewItem, 
  UserSegmentItem, 
  FunnelPerformanceItem 
} from '../interfaces/admin-dashboard.interface';
import { 
  GetStatsDocs, 
  GetWeeklyOverviewDocs, 
  GetUserSegmentsDocs, 
  GetFunnelPerformanceDocs 
} from '../docs/admin-dashboard-swagger.doc';
import { ApiTags } from '@nestjs/swagger';

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
  async getWeeklyOverview(): Promise<{ statusCode: number; message: string; data: WeeklyOverviewItem[] }> {
    const data = await this.dashboardService.getWeeklyOverview();
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
}