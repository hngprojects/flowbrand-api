import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDataDto {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  totalFunnelsGenerated: number;

  @ApiProperty()
  funnelsThisWeek: number;
}

export class WeeklyOverviewItemDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  newUsers: number;

  @ApiProperty()
  funnelsGenerated: number;
}

export class UserSegmentItemDto {
  @ApiProperty()
  label: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

export class FunnelPerformanceItemDto {
  @ApiProperty()
  stagePosition: number;

  @ApiProperty()
  stageName: string;

  @ApiProperty()
  completionRate: number;
}