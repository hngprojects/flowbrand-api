import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    description: 'Registered email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}
