import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ALLOWED_SSA_COUNTRIES } from '../../../users/enums/allowed-ssa-countries.enum';

const IVORY_COAST_CANONICAL =
  ALLOWED_SSA_COUNTRIES.find((country) => country.startsWith('Ivory Coast')) ??
  'Ivory Coast (Cote d\'Ivoire)';

const COUNTRY_ALIASES: Record<string, string> = {
  'ivory coast': IVORY_COAST_CANONICAL,
  'cote d\'ivoire': IVORY_COAST_CANONICAL,
  'cape verde': 'Cabo Verde (Cape Verde)',
  'cabo verde': 'Cabo Verde (Cape Verde)',
  drc: 'Democratic Republic of the Congo (DRC)',
  'democratic republic of the congo': 'Democratic Republic of the Congo (DRC)',
  'democratic republic of congo': 'Democratic Republic of the Congo (DRC)',
  eswatini: 'Eswatini (Swaziland)',
  swaziland: 'Eswatini (Swaziland)',
  'sao tome and principe': 'Sao Tome and Principe',
  'sao tome & principe': 'Sao Tome and Principe',
  congo: 'Republic of the Congo',
  'republic of congo': 'Republic of the Congo',
  burkina: 'Burkina Faso',
  'burkina faso': 'Burkina Faso',
  'burkina-faso': 'Burkina Faso',
};

export class UpdateAdminProfileDto {
  @ApiPropertyOptional({
    example: 'Jane Admin',
    minLength: 2,
    maxLength: 100,
    description: 'Admin full name. Leading and trailing spaces are trimmed before validation.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  full_name?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    enum: ALLOWED_SSA_COUNTRIES,
    description: 'Country must be one of the supported SSA countries.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();

    if (COUNTRY_ALIASES[trimmed]) {
      return COUNTRY_ALIASES[trimmed];
    }

    return ALLOWED_SSA_COUNTRIES.find((country) => country.toLowerCase() === trimmed) ?? value;
  })
  @IsIn(ALLOWED_SSA_COUNTRIES)
  country?: string;

  @ApiPropertyOptional({
    example: 'admin@example.com',
    description: 'Read-only field. Sending this value returns HTTP 422.',
  })
  @IsOptional()
  email?: unknown;
}
