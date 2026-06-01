import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAdminProfileDto } from '../dto/update-admin-profile.dto';

describe('UpdateAdminProfileDto', () => {
  it('FR-3: trims full_name before MinLength validation', async () => {
    const dto = plainToInstance(UpdateAdminProfileDto, { full_name: '  Jane Admin  ' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.full_name).toBe('Jane Admin');
  });

  it('EC-02: rejects whitespace-only full_name', async () => {
    const dto = plainToInstance(UpdateAdminProfileDto, { full_name: '   ' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.constraints).toHaveProperty('minLength');
  });

  it('AC-04: rejects invalid country values', async () => {
    const dto = plainToInstance(UpdateAdminProfileDto, { country: 'Canada' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.constraints).toHaveProperty('isIn');
  });

  it('accepts valid country aliases and normalizes to canonical list entry', async () => {
    const dto = plainToInstance(UpdateAdminProfileDto, { country: 'cote d\'ivoire' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(typeof dto.country).toBe('string');
    expect(dto.country?.startsWith('Ivory Coast')).toBe(true);
  });

  it('allows email field so service can return explicit 422 message', async () => {
    const dto = plainToInstance(UpdateAdminProfileDto, { email: 'admin@example.com' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('admin@example.com');
  });
});
