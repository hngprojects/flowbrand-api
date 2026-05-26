import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecurePass123!' })
  @IsString()
  @IsNotEmpty()
  old_password: string;

  @ApiProperty({ example: 'NewSecurePass456@' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).*$/, {
    message: 'new_password must contain at least one uppercase letter, one lowercase letter, one number, and one ASCII symbol',
  })
  new_password: string;

  @ApiProperty({ example: 'NewSecurePass456@' })
  @IsString()
  @IsNotEmpty()
  confirm_password: string;
}