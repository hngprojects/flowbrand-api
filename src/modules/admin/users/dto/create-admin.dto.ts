import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { UserRole } from '../../../users/enums/user-role.enum';
import { ADMIN_INVALID_PASSWORD_VALUE } from '../../../../constants/system.messages';

export class CreateAdminDto {
  @ApiProperty({ example: 'Jane Admin' })
  @IsString()
  full_name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/, {
    message: ADMIN_INVALID_PASSWORD_VALUE,
  })
  password: string;

  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.SUPER_ADMIN] })
  @IsEnum([UserRole.ADMIN, UserRole.SUPER_ADMIN])
  role: UserRole.ADMIN | UserRole.SUPER_ADMIN;
}
