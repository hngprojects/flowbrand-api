import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { PASSWORD_VALIDATION_FAILED } from '../../../../constants/system.messages';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invite token from the email link' })
  @IsString()
  @MinLength(1)
  token: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  full_name: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: PASSWORD_VALIDATION_FAILED,
  })
  password: string;
}