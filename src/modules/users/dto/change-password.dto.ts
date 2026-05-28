import { ApiProperty } from '@nestjs/swagger';
import { 
  IsNotEmpty, 
  IsString, 
  Matches, 
  MaxLength, 
  MinLength
} from 'class-validator';
import { MatchesField } from '../../../common/decorators/match-field.decorator';
import * as SYS_MSG from '../../../constants/system.messages';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecurePass123!' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({ example: 'NewSecurePass456@' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).*$/, {
    message: SYS_MSG.PASSWORD_TOO_WEAK,
  })
  newPassword: string;

  @ApiProperty({ example: 'NewSecurePass456@' })
  @IsString()
  @IsNotEmpty()
  @MatchesField('newPassword', { message: SYS_MSG.INCORRECT_CONFIRM_PASSWORD })
  confirmPassword: string;
}
