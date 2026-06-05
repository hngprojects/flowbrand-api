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

const COUNTRY_ALIASES: Record<string, string> = {
  'ivory coast': 'Ivory Coast (Côte d\'Ivoire)',
  'côte d\'ivoire': 'Ivory Coast (Côte d\'Ivoire)',
  'cote d\'ivoire': 'Ivory Coast (Côte d\'Ivoire)',
  'cape verde': 'Cabo Verde (Cape Verde)',
  'cabo verde': 'Cabo Verde (Cape Verde)',
  'drc': 'Democratic Republic of the Congo (DRC)',
  'democratic republic of the congo': 'Democratic Republic of the Congo (DRC)',
  'democratic republic of congo': 'Democratic Republic of the Congo (DRC)',
  'eswatini': 'Eswatini (Swaziland)',
  'swaziland': 'Eswatini (Swaziland)',
  'sao tome and principe': 'Sao Tome and Principe',
  'são tomé and príncipe': 'Sao Tome and Principe',
  'sao tome & principe': 'Sao Tome and Principe',
  'congo': 'Republic of the Congo',
  'republic of congo': 'Republic of the Congo',
};

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
    example: 'Ben Clothing',
    minLength: 1,
    maxLength: 150,
    description: 'Business name. Leading/trailing whitespace is trimmed automatically.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(150)
  businessName?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    enum: ALLOWED_SSA_COUNTRIES,
    description: 'Country — must be an allowed SSA country in canonical casing.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    
    // Check if the input is a known alias
    if (COUNTRY_ALIASES[trimmed]) {
      return COUNTRY_ALIASES[trimmed];
    }

    // Check for exact case-insensitive match in the enum list
    return (
      ALLOWED_SSA_COUNTRIES.find(
        (country) => country.toLowerCase() === trimmed,
      ) ?? value
    );
  })
  @IsIn(ALLOWED_SSA_COUNTRIES)
  country?: string;
}