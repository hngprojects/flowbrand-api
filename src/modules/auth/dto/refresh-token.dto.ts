import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsJWT, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Optional. If omitted, the server falls back to the HttpOnly `refreshToken` cookie set on login.',
  })
  @IsOptional()
  @IsJWT()
  refreshToken?: string;
}
