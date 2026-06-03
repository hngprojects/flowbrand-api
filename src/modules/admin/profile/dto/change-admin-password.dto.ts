import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { MatchesField } from '../../../../common/decorators/match-field.decorator';
import * as SYS_MSG from '../../../../constants/system.messages';

export class ChangeAdminPasswordDto {
  @ApiProperty({
    example: 'CurrentAdmin@123',
    description: 'Current password for old-password verification.',
  })
  @IsString()
  @IsNotEmpty()
  old_password: string;

  @ApiProperty({
    example: 'StrongerAdmin!456',
    minLength: 8,
    description: 'Must include at least one uppercase letter, one lowercase letter, one digit, and one symbol.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: SYS_MSG.ADMIN_INVALID_PASSWORD_VALUE,
  })
  new_password: string;

  @ApiProperty({
    example: 'StrongerAdmin!456',
    description: 'Must exactly match new_password.',
  })
  @IsString()
  @IsNotEmpty()
  @MatchesField('new_password', { message: SYS_MSG.INCORRECT_CONFIRM_PASSWORD })
  confirm_password: string;
}
