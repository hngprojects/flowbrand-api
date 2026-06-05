import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserAccountStatus } from '../../../users/enums/user-account-status.enum';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserAccountStatus,
    description: 'The new status of the user',
    example: UserAccountStatus.ACTIVE,
  })
  @IsEnum(UserAccountStatus)
  @IsNotEmpty()
  status: UserAccountStatus;
}
