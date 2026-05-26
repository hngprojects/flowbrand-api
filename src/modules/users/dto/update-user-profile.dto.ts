import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ALLOWED_SSA_COUNTRIES } from '../enums/allowed-ssa-countries.enum';

export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    example: 'Jane Doe',
    minLength: 2,
    maxLength: 100,
    description: 'User full name. Leading/trailing whitespace is trimmed automatically.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    enum: ALLOWED_SSA_COUNTRIES,
    description: 'Country — must be an allowed SSA country in canonical casing.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return (
      ALLOWED_SSA_COUNTRIES.find(
        (country) => country.toLowerCase() === trimmed.toLowerCase(),
      ) ?? value
    );
  })
  @IsIn(ALLOWED_SSA_COUNTRIES)
  country?: string;
}