import { ApiProperty } from '@nestjs/swagger';
import { UserPlan } from '../../../users/enums/user-plan.enum';
import { UserAccountStatus } from '../../../users/enums/user-account-status.enum';
import { FunnelStatus } from '../../../funnels/enums/funnel-status.enum';
import { UploadDocumentStatus } from '../../../upload/upload.types';

export class AdminUserStrategyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty()
  stageCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ enum: FunnelStatus })
  status: FunnelStatus;
}

export class AdminUserDocumentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  fileSizeBytes: string;

  @ApiProperty()
  uploadedAt: Date;

  @ApiProperty({ enum: UploadDocumentStatus })
  status: UploadDocumentStatus;
}

export class AdminUserInformationDto {
  @ApiProperty({ nullable: true })
  businessType: string | null;

  @ApiProperty({ nullable: true })
  targetCustomer: string | null;

  @ApiProperty({ nullable: true })
  primaryGoal: string | null;
}

export class AdminUserProfileDto {
  @ApiProperty()
  fullName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: UserPlan })
  plan: UserPlan;

  @ApiProperty({ nullable: true })
  country: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ nullable: true })
  lastActiveAt: Date | null;

  @ApiProperty({ enum: UserAccountStatus })
  status: UserAccountStatus | 'deleted';
}

export class AdminUserDetailResponseDto {
  @ApiProperty({ type: AdminUserProfileDto })
  profile: AdminUserProfileDto;

  @ApiProperty({ type: [AdminUserStrategyDto] })
  strategies: AdminUserStrategyDto[];

  @ApiProperty({ type: [AdminUserDocumentDto] })
  documents: AdminUserDocumentDto[];

  @ApiProperty({ type: AdminUserInformationDto })
  informationProvided: AdminUserInformationDto;
}
