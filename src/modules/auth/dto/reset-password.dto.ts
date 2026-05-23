import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

/** Payload for the final step of the password reset flow. */
export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token-issued-by-verify-reset-otp' })
  @IsString()
  @IsNotEmpty()
  reset_token: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
