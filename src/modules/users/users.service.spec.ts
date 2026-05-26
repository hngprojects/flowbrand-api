import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import * as SYS_MSG from '../../constants/system.messages';
import { UserModelAction } from './actions/user.action';
import { UsersService } from './users.service';
import { UserSessionModelAction } from './actions/user-session.action';
import { AuthMetadataModelAction } from '../auth/actions/auth-metadata.action';
import { RedisService } from '../redis/redis.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockUserSessionModelAction = {
  findByUserId: jest.fn(),
  updateById: jest.fn()
};

const mockAuthMetadataModelAction = {
  updateByUserId: jest.fn(),
};

const mockRedisService = {
  del: jest.fn(),
};

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_EMAIL = 'test@example.com';

const mockUser = {
  id: USER_ID,
  email: USER_EMAIL,
  full_name: 'Test User',
  password_hash: 'hashed-password',
  is_verified: false,
  is_active: true,
  roles: [{ role: 'user' }],
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: AuthMetadataModelAction, useValue: mockAuthMetadataModelAction },
        { provide: RedisService, useValue: mockRedisService },

      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    const createDto = {
      email: USER_EMAIL,
      password: 'Password123!',
      fullName: 'Test User',
      termsAccepted: true,
    };

    it('AC-01: creates a user and returns the created user', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(mockUser);

      const result = await service.create(createDto);

      expect(mockUserModelAction.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(result).toEqual(mockUser);
    });

    it('AC-02: throws 409 when email already exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser);

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
      expect(mockUserModelAction.create).not.toHaveBeenCalled();
    });

    it('AC-03: throws 409 with USER_ACCOUNT_LOCKED when account is inactive', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue({ ...mockUser, is_active: false });

      await expect(service.create(createDto)).rejects.toThrow(SYS_MSG.USER_ACCOUNT_LOCKED);
    });

    it('AC-04: throws 409 on duplicate key DB error', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      const dbError = Object.assign(new QueryFailedError('', [], new Error()), {
        driverError: { code: '23505' },
      });
      mockUserModelAction.create.mockRejectedValue(dbError);
      mockUserModelAction.findByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findById', () => {
    it('AC-05: returns user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser);

      const result = await service.findById(USER_ID);

      expect(result).toEqual(mockUser);
      expect(mockUserModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: USER_ID },
      });
    });

    it('AC-06: throws 404 when user not found', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.findById(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('AC-06: 404 message contains the user id', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.findById(USER_ID)).rejects.toThrow(USER_ID);
    });
  });

  describe('findByEmail', () => {
    it('AC-07: returns user when email exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser);

      const result = await service.findByEmail(USER_EMAIL);

      expect(result).toEqual(mockUser);
    });

    it('AC-08: returns null when email does not exist', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const updateDto = { fullName: 'Updated Name' };

    it('AC-09: updates and returns user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser);
      mockUserModelAction.update.mockResolvedValue({ ...mockUser, full_name: 'Updated Name' });

      const result = await service.update(USER_ID, updateDto);

      expect(result.full_name).toBe('Updated Name');
    });

    it('AC-10: throws 404 when user not found during update', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.update(USER_ID, updateDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('AC-11: hashes password when password is provided in update', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser);
      mockUserModelAction.update.mockResolvedValue(mockUser);

      await service.update(USER_ID, { password: 'NewPass123!' });

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 10);
    });

    it('AC-12: throws 500 when update returns null', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser);
      mockUserModelAction.update.mockResolvedValue(null);

      await expect(service.update(USER_ID, updateDto)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('remove', () => {
    it('AC-13: deletes user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser);
      mockUserModelAction.delete.mockResolvedValue(undefined);

      await expect(service.remove(USER_ID)).resolves.toBeUndefined();
      expect(mockUserModelAction.delete).toHaveBeenCalled();
    });

    it('AC-14: throws 404 when user not found during remove', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.remove(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockUserModelAction.delete).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const changePasswordDto = {
      oldPassword: 'CurrentPass123!',
      newPassword: 'NewPass456@',
      confirmPassword: 'NewPass456@',
    };

    beforeEach(() => {
      mockUserModelAction.get.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserModelAction.update.mockResolvedValue(mockUser);
      mockAuthMetadataModelAction.updateByUserId.mockResolvedValue(undefined);
      mockUserSessionModelAction.findByUserId.mockResolvedValue([]);
    });

    it('AC-15: returns success message when old password is correct and new password is valid', async () => {
      const result = await service.changePassword(USER_ID, changePasswordDto);
      expect(result.message).toBe(SYS_MSG.PASSWORD_CHANGE_SUCCESSFUL);
    });

    it('AC-16: updates auth_metadata.password_changed_at after successful change', async () => {
      await service.changePassword(USER_ID, changePasswordDto);
      expect(mockAuthMetadataModelAction.updateByUserId).toHaveBeenCalledWith(
        USER_ID,
        { password_changed_at: expect.any(Date) },
      );
    });

    it('AC-17: revokes all user sessions after successful password change', async () => {
      const mockSessions = [
        { id: 'session-1', is_revoked: false },
        { id: 'session-2', is_revoked: false },
      ];
      mockUserSessionModelAction.findByUserId.mockResolvedValue(mockSessions);

      await service.changePassword(USER_ID, changePasswordDto);

      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledTimes(2);
      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledWith('session-1', {
        is_revoked: true,
        revoked_at: expect.any(Date),
      });
      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledWith('session-2', {
        is_revoked: true,
        revoked_at: expect.any(Date),
      });
    });

    it('AC-18: deletes Redis keys for all sessions after successful password change', async () => {
      const mockSessions = [{ id: 'session-1', is_revoked: false }];
      mockUserSessionModelAction.findByUserId.mockResolvedValue(mockSessions);

      await service.changePassword(USER_ID, changePasswordDto);

      expect(mockRedisService.del).toHaveBeenCalledWith(`active_session:${USER_ID}:session-1`);
      expect(mockRedisService.del).toHaveBeenCalledWith(`sess:${USER_ID}:session-1`);
    });

    it('AC-19: throws UnauthorizedException when old password is incorrect', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const error = await service.changePassword(USER_ID, changePasswordDto).catch(e => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe(SYS_MSG.INCORRECT_OLD_PASSWORD);
    });

    it('AC-20: throws UnprocessableEntityException when new password is same as old password', async () => {
      const error = await service.changePassword(USER_ID, {
        ...changePasswordDto,
        newPassword: changePasswordDto.oldPassword,
        confirmPassword: changePasswordDto.oldPassword,
      }).catch(e => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.message).toBe(SYS_MSG.PASSWORD_CHANGE_NOT_SUCCESSFUL);
    });

    it('AC-21: throws BadRequestException when confirm password does not match new password', async () => {
      const error = await service.changePassword(USER_ID, {
        ...changePasswordDto,
        confirmPassword: 'Mismatch123!',
      }).catch(e => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(SYS_MSG.INCORRECT_CONFIRM_PASSWORD);
    });

    it('AC-22: throws UnprocessableEntityException for Google OAuth account with no password hash', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockUser,
        auth_provider: 'google',
        password_hash: null,
      });

      const error = await service.changePassword(USER_ID, changePasswordDto).catch(e => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.message).toBe(SYS_MSG.PASSWORD_CHANGE_NOT_SUPPORTED);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('AC-23: throws NotFoundException when user does not exist', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      const error = await service.changePassword(USER_ID, changePasswordDto).catch(e => e);
      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('SEC-01: calls bcrypt.compare with plain text password and stored hash, never compares plain text directly', async () => {
      await service.changePassword(USER_ID, changePasswordDto);
      expect(bcrypt.compare).toHaveBeenCalledWith(
        changePasswordDto.oldPassword,
        mockUser.password_hash,
      );
    });

    it('SEC-02: logger does not include password hash in log payload', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.changePassword(USER_ID, changePasswordDto);

      const logPayload = JSON.stringify(logSpy.mock.calls[0]);
      expect(logPayload).not.toContain(mockUser.password_hash);
      expect(logPayload).not.toContain(changePasswordDto.oldPassword);
      expect(logPayload).not.toContain(changePasswordDto.newPassword);
    });

    it('SEC-03: hashes new password with correct bcrypt cost factor before saving', async () => {
      await service.changePassword(USER_ID, changePasswordDto);
      expect(bcrypt.hash).toHaveBeenCalledWith(changePasswordDto.newPassword, 10);
    });

    it('SEC-04: saves hashed password not plain text to the database', async () => {
      await service.changePassword(USER_ID, changePasswordDto);
      expect(mockUserModelAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updatePayload: { password_hash: 'hashed-password' },
        }),
      );
    });

    it('AC-25: second rapid request fails with UnauthorizedException because hash has already changed', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await service.changePassword(USER_ID, changePasswordDto);

      const error = await service.changePassword(USER_ID, changePasswordDto).catch(e => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
    });

    it('AC-26: skips session revocation when user has no active sessions', async () => {
      mockUserSessionModelAction.findByUserId.mockResolvedValue([]);

      await service.changePassword(USER_ID, changePasswordDto);

      expect(mockUserSessionModelAction.updateById).not.toHaveBeenCalled();
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });

    it('AC-27: skips already revoked sessions during revocation', async () => {
      mockUserSessionModelAction.findByUserId.mockResolvedValue([
        { id: 'session-1', is_revoked: true },
      ]);

      await service.changePassword(USER_ID, changePasswordDto);

      expect(mockUserSessionModelAction.updateById).not.toHaveBeenCalled();
    });
  });
});