import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class JoinWaitlistDto {

  @ApiProperty({
    description: 'The email address of the user joining the waitlist',
    example: 'johndoe@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;
}
