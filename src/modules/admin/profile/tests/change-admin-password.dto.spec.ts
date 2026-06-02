import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as SYS_MSG from '../../../../constants/system.messages';
import { ChangeAdminPasswordDto } from '../dto/change-admin-password.dto';

describe('ChangeAdminPasswordDto', () => {
  it('AC-03: rejects new_password that fails policy', async () => {
    const dto = plainToInstance(ChangeAdminPasswordDto, {
      old_password: 'CurrentAdmin@123',
      new_password: 'alllowercase',
      confirm_password: 'alllowercase',
    });

    const errors = await validate(dto);
    const newPasswordError = errors.find((error) => error.property === 'new_password');

    expect(newPasswordError).toBeDefined();
    expect(newPasswordError?.constraints).toHaveProperty('matches', SYS_MSG.ADMIN_PASSWORD_POLICY_VALIDATION_FAILED);
  });

  it('AC-04: rejects when confirm_password does not match new_password', async () => {
    const dto = plainToInstance(ChangeAdminPasswordDto, {
      old_password: 'CurrentAdmin@123',
      new_password: 'NewAdmin!789',
      confirm_password: 'NewAdmin!780',
    });

    const errors = await validate(dto);
    const confirmPasswordError = errors.find((error) => error.property === 'confirm_password');

    expect(confirmPasswordError).toBeDefined();
    expect(confirmPasswordError?.constraints).toHaveProperty('matchesField', SYS_MSG.ADMIN_CONFIRM_PASSWORD_MISMATCH);
  });

  it('FR-2: old_password is required', async () => {
    const dto = plainToInstance(ChangeAdminPasswordDto, {
      new_password: 'NewAdmin!789',
      confirm_password: 'NewAdmin!789',
    });

    const errors = await validate(dto);
    const oldPasswordError = errors.find((error) => error.property === 'old_password');

    expect(oldPasswordError).toBeDefined();
    expect(oldPasswordError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('SEC-01: preserves surrounding whitespace so passwords are validated exactly as entered', async () => {
    const dto = plainToInstance(ChangeAdminPasswordDto, {
      old_password: ' CurrentAdmin@123 ',
      new_password: ' NewAdmin!789 ',
      confirm_password: ' NewAdmin!789 ',
    });

    expect(dto.old_password).toBe(' CurrentAdmin@123 ');
    expect(dto.new_password).toBe(' NewAdmin!789 ');
    expect(dto.confirm_password).toBe(' NewAdmin!789 ');
  });

  it('accepts valid password payload', async () => {
    const dto = plainToInstance(ChangeAdminPasswordDto, {
      old_password: 'CurrentAdmin@123',
      new_password: 'NewAdmin!789',
      confirm_password: 'NewAdmin!789',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
