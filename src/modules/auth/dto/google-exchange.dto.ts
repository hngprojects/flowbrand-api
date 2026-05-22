import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleExchangeDto {
  @ApiProperty({
    description: 'The short-lived authorization exchange code returned from the Google redirect',
    example: 'd9b736bc64a34b22b109e25c568393e18cf41f8a846c4bf92a543ee7d478e124',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}