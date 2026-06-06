import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class PlanDistributionDto {
  @ApiProperty({ description: 'Number of users on the free plan', example: 140 })
  free: number;

  @ApiProperty({ description: 'Number of users on the pro plan', example: 44 })
  pro: number;
}

export class DashboardStatsDataDto {
  @ApiProperty({ description: 'Total number of registered users', example: 184 })
  totalUsers: number;

  @ApiProperty({ description: 'Users who logged in within the last 30 days', example: 142 })
  activeUsers: number;

  @ApiProperty({ description: 'Total funnels with status active or failed', example: 874 })
  totalFunnelsGenerated: number;

  @ApiProperty({ description: 'Funnels created since the start of the current calendar week', example: 42 })
  funnelsThisWeek: number;

  @ApiProperty({ description: 'Breakdown of users by subscription plan', type: PlanDistributionDto })
  planDistribution: PlanDistributionDto;
}

export class WeeklyOverviewItemDto {
  @ApiProperty({ description: 'ISO date string representing the bucket start (day or week)', example: '2026-03-24' })
  date: string;

  @ApiProperty({ description: 'New users registered in this bucket', example: 41 })
  newUsers: number;

  @ApiProperty({ description: 'Funnels created in this bucket', example: 18 })
  funnelsGenerated: number;
}

export class WeeklyOverviewQueryDto {
  @ApiPropertyOptional({
    enum: ['7d', '12w'],
    default: '7d',
    description: '7d returns 7 daily buckets (default). 12w returns 12 ISO-week buckets.',
  })
  @IsOptional()
  @IsEnum(['7d', '12w'])
  period?: '7d' | '12w' = '7d';
}

export class UserSegmentItemDto {
  @ApiProperty({ description: 'Business type label', example: 'B2B' })
  label: string;

  @ApiProperty({ description: 'Number of users in this segment', example: 92 })
  count: number;

  @ApiProperty({ description: 'Percentage share of total users (0–100)', example: 50 })
  percentage: number;
}

export class FunnelPerformanceItemDto {
  @ApiProperty({ description: 'Stage position (1-indexed)', example: 1 })
  stagePosition: number;

  @ApiProperty({ description: 'Stage name', example: 'Awareness' })
  stageName: string;

  @ApiProperty({ description: 'Percentage of funnels that completed this stage', example: 72 })
  completionRate: number;
}

export class UserStageItemDto {
  @ApiProperty({ description: 'Machine-readable stage key', example: 'signedUp' })
  stage: string;

  @ApiProperty({ description: 'Human-readable stage label', example: 'Signed up' })
  label: string;

  @ApiProperty({ description: 'Number of users at this lifecycle stage', example: 184 })
  count: number;
}

export class RetentionBandItemDto {
  @ApiProperty({ description: 'Machine-readable retention band key', example: 'lessThan1Week' })
  band: string;

  @ApiProperty({ description: 'Human-readable band label', example: '< 1 week' })
  label: string;

  @ApiProperty({ description: 'Number of users in this retention band', example: 184 })
  count: number;
}