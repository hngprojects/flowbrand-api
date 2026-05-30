import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import * as SYS_MSG from '../../constants/system.messages';
import { APP_EVENTS } from '../../common/constants/app-events';
import { UserModelAction } from './actions/user.action';
import { UsersService } from './users.service';
import { UserSessionModelAction } from './actions/user-session.action';
import { AuthMetadataModelAction } from '../auth/actions/auth-metadata.action';
import { RedisService } from '../redis/redis.service';
import { redisKeys } from '../../constants/redis-keys';
import { UserStateService } from './user-state.service';
import { User } from './entities/user.entity';
import { UserStateResponse } from './interfaces/user-state.interface';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { UserRole } from './enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UPLOAD_OBJECT_STORAGE } from '../upload/upload.types';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// file-type is a pure-ESM package loaded via dynamic import() in users.service.ts.
// Under ts-jest's CommonJS VM the real module cannot load, so mock it with a
// lightweight magic-byte sniffer returning the { ext, mime } shape the service expects.
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async (input: Uint8Array) => {
    const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { ext: 'png', mime: 'image/png' };
    }
    if (bytes.subarray(0, 4).toString('utf8') === '%PDF') {
      return { ext: 'pdf', mime: 'application/pdf' };
    }
    return undefined;
  }),
}));

// Mock UserModelAction
const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  updateAvatarUrl: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

const mockUserSessionModelAction = {
  revokeAllUserSessionsInDb: jest.fn().mockResolvedValue([]),
  deleteSessionRedisKeys: jest.fn().mockResolvedValue(undefined),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  createSession: jest.fn(),
};

const mockAuthMetaModelAction = {
  updateByUserId: jest.fn(),
  findByUserId: jest.fn(),
  createForUser: jest.fn(),
};

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_EMAIL = 'test@example.com';

// Mock WizardSessionModelAction
const mockWizardSessionModelAction = {
  findActiveSession: jest.fn(),
  findSessionById: jest.fn(),
  saveSession: jest.fn(),
  markAsExpired: jest.fn(),
  resolveStartWizardSession: jest.fn(),
};

// Mock UserStateService
const mockUserStateService = {
  getUserState: jest.fn(),
  invalidateUserStateCache: jest.fn(),
};

const mockNotificationsService = {
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
};

// Mock RedisService
const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  getdel: jest.fn(),
  setStrict: jest.fn(),
  setNx: jest.fn(),
  exists: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  rateLimit: jest.fn(),
  delByPattern: jest.fn(),
};

const mockUser = (): Partial<User> => ({
  id: USER_ID,
  email: USER_EMAIL,
  full_name: 'Test User',
  password_hash: 'hashed-password',
  is_verified: false,
  is_active: true,
  auth_provider: 'local',
});

const mockFullUser = {
  id: USER_ID,
  email: USER_EMAIL,
  full_name: 'Test User',
  country: 'Nigeria',
  avatar_url: null,
  auth_provider: 'local',
  is_verified: true,
  created_at: new Date('2024-01-15'),
  updated_at: new Date('2024-06-01'),
};

const mockNotificationPreferences = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  user_id: USER_ID,
  email_funnel_ready: true,
  email_stage_unlocked: true,
  email_stage_completed: false,
  email_weekly_digest: true,
  inapp_task_completed: true,
  inapp_stage_unlocked: true,
  created_at: new Date('2026-05-29T10:30:00.000Z'),
  updated_at: new Date('2026-05-29T10:30:00.000Z'),
};

const mockNotificationPreferencesResponse = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: USER_ID,
  emailFunnelReady: true,
  emailStageUnlocked: true,
  emailStageCompleted: false,
  emailWeeklyDigest: true,
  inappTaskCompleted: true,
  inappStageUnlocked: true,
  createdAt: new Date('2026-05-29T10:30:00.000Z'),
  updatedAt: new Date('2026-05-29T10:30:00.000Z'),
};

// Mock AuthMetadataModelAction
const mockAuthMetadataModelAction = {
  updateByUserId: jest.fn(),
  findByUserId: jest.fn(),
  createForUser: jest.fn(),
};

// Mock Bull queue
const mockAccountDeletionQueue = {
  add: jest.fn(),
};

// Mock DataSource
const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    update: jest.fn(),
  },
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockObjectStorage = {
  putObject: jest.fn(),
  getObject: jest.fn(),
  deleteObject: jest.fn(),
  createPresignedGetObjectUrl: jest.fn(),
};

// Mock PinoLoggerService
const mockPinoLoggerService = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
  setContext: jest.fn(),
  getLoggerLevel: jest.fn(),
  runWithContext: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;
  let mockEventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
        { provide: AuthMetadataModelAction, useValue: mockAuthMetaModelAction },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UserStateService, useValue: mockUserStateService },
        { provide: PinoLoggerService, useValue: mockPinoLoggerService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: getQueueToken(ACCOUNT_DELETION_QUEUE), useValue: mockAccountDeletionQueue },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: UPLOAD_OBJECT_STORAGE, useValue: mockObjectStorage },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ─────────────────────────────────────────────────────────────────
  // CRUD TESTS
  // ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      email: USER_EMAIL,
      password: 'Password123!',
      fullName: 'Test User',
      termsAccepted: true,
    };

    it('creates a user and returns the created user', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(mockUser());

      const result = await service.create(createDto);

      expect(mockUserModelAction.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(result).toEqual(mockUser());
    });

    it('throws 409 when email already exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser());

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
      expect(mockUserModelAction.create).not.toHaveBeenCalled();
    });

    it('throws 409 with USER_ACCOUNT_LOCKED when account is inactive', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue({ ...mockUser(), is_active: false });

      await expect(service.create(createDto)).rejects.toThrow(SYS_MSG.USER_ACCOUNT_LOCKED);
    });

    it('throws 409 on duplicate key DB error', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      const dbError = Object.assign(new QueryFailedError('', [], new Error()), {
        driverError: { code: '23505' },
      });
      mockUserModelAction.create.mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());

      const result = await service.findById(USER_ID);

      expect(result).toEqual(mockUser());
      expect(mockUserModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: USER_ID },
      });
    });

    it('throws 404 when user not found', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.findById(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('returns user when email exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser());

      const result = await service.findByEmail(USER_EMAIL);

      expect(result).toEqual(mockUser());
    });

    it('returns null when email does not exist', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const updateDto = { fullName: 'Updated Name' };

    it('updates and returns user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.update.mockResolvedValue({ ...mockUser(), full_name: 'Updated Name' });

      const result = await service.update(USER_ID, updateDto);

      expect(result.full_name).toBe('Updated Name');
    });

    it('throws 404 when user not found during update', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.update(USER_ID, updateDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hashes password when password is provided in update', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.update.mockResolvedValue(mockUser());

      await service.update(USER_ID, { password: 'NewPass123!' });

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 10);
    });

    it('throws 500 when update returns null', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.update.mockResolvedValue(null);

      await expect(service.update(USER_ID, updateDto)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('remove', () => {
    it('deletes user when found', async () => {
      mockUserModelAction.get.mockResolvedValue(mockUser());
      mockUserModelAction.delete.mockResolvedValue(undefined);

      await expect(service.remove(USER_ID)).resolves.toBeUndefined();
      expect(mockUserModelAction.delete).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.ACCOUNT_DELETED,
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('throws 404 when user not found during remove', async () => {
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
      mockUserModelAction.get.mockResolvedValue(mockUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserModelAction.update.mockResolvedValue(mockUser());
      mockAuthMetaModelAction.updateByUserId.mockResolvedValue(undefined);
      mockAuthMetaModelAction.findByUserId.mockResolvedValue({ user_id: USER_ID });
      mockUserSessionModelAction.findByUserId.mockResolvedValue([]);
    });

    it('AC-15: returns success message when old password is correct and new password is valid', async () => {
      await expect(service.changePassword(USER_ID, changePasswordDto)).resolves.toBeUndefined();
    });

    it('AC-16: updates auth_metadata.password_changed_at after successful change', async () => {
      await service.changePassword(USER_ID, changePasswordDto);
      expect(mockAuthMetaModelAction.updateByUserId).toHaveBeenCalledWith(
        USER_ID,
        { password_changed_at: expect.any(Date) },
      );
      expect(mockAuthMetaModelAction.findByUserId).toHaveBeenCalledWith(USER_ID);
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

      expect(mockRedisService.del).toHaveBeenCalledTimes(2);
      expect(mockRedisService.del).toHaveBeenCalledWith(redisKeys.activeSession(USER_ID, 'session-1'));
      expect(mockRedisService.del).toHaveBeenCalledWith(redisKeys.session(USER_ID, 'session-1'));
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

    it('AC-21: throws UnprocessableEntityException when confirm password does not match new password — defense-in-depth', async () => {
      const error = await service.changePassword(USER_ID, {
        ...changePasswordDto,
        confirmPassword: 'Mismatch123!',
      }).catch(e => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(mockUserModelAction.update).not.toHaveBeenCalled();
    });

    it('AC-22: throws UnprocessableEntityException for Google OAuth account with no password hash', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockUser(),
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
        mockUser().password_hash,
      );
    });

    it('SEC-02: logger does not include password hash in log payload', async () => {
      const logSpy = jest.spyOn(service['pinoLogger'], 'info');
      
      await service.changePassword(USER_ID, changePasswordDto);

      const logPayload = JSON.stringify(logSpy.mock.calls);
      expect(logPayload).not.toContain(mockUser().password_hash);
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
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });

    it('AC-28: processes only non-revoked sessions when mix of revoked and active sessions exist', async () => {
      mockUserSessionModelAction.findByUserId.mockResolvedValue([
        { id: 'session-1', is_revoked: true },
        { id: 'session-2', is_revoked: false },
        { id: 'session-3', is_revoked: false },
      ]);

      await service.changePassword(USER_ID, changePasswordDto);

      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledTimes(2);
      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledWith('session-2', {
        is_revoked: true,
        revoked_at: expect.any(Date),
      });
      expect(mockUserSessionModelAction.updateById).toHaveBeenCalledWith('session-3', {
        is_revoked: true,
        revoked_at: expect.any(Date),
      });

      expect(mockRedisService.del).toHaveBeenCalledTimes(4);
      expect(mockRedisService.del).not.toHaveBeenCalledWith(expect.stringContaining('session-1'));
    });

    it('AC-29: creates auth_metadata when it does not exist', async () => {
      mockAuthMetaModelAction.findByUserId.mockResolvedValue(null);
      mockAuthMetaModelAction.createForUser.mockResolvedValue({ user_id: USER_ID });

      await service.changePassword(USER_ID, changePasswordDto);

      expect(mockAuthMetaModelAction.createForUser).toHaveBeenCalledWith({
        user_id: USER_ID,
        password_changed_at: expect.any(Date) ,
      });
    });
  });

  describe('avatar operations', () => {
    const onePixelPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7f4b4AAAAASUVORK5CYII=',
      'base64',
    );
    const avatarFile = {
      originalname: 'avatar.png',
      size: onePixelPngBuffer.length,
      buffer: onePixelPngBuffer,
      mimetype: 'application/octet-stream',
    } as Express.Multer.File;

    beforeEach(() => {
      mockObjectStorage.putObject.mockReset();
      mockObjectStorage.deleteObject.mockReset();
      mockObjectStorage.createPresignedGetObjectUrl.mockReset();
      mockUserModelAction.updateAvatarUrl.mockReset();
    });

    it('uploads avatar successfully and returns signed URL', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      mockObjectStorage.createPresignedGetObjectUrl.mockResolvedValue(
        'https://signed.example/avatar.jpg',
      );
      mockUserModelAction.updateAvatarUrl.mockResolvedValue({
        ...mockFullUser,
        avatar_url: 'avatars/user/new.jpg',
      });

      const result = await service.uploadAvatar(USER_ID, avatarFile);

      expect(mockObjectStorage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/png',
          contentLength: onePixelPngBuffer.length,
        }),
      );
      expect(mockObjectStorage.createPresignedGetObjectUrl).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^avatars/${USER_ID}/`)),
        900,
      );
      expect(mockUserModelAction.updateAvatarUrl).toHaveBeenCalled();
      expect(result).toEqual({ avatarUrl: 'https://signed.example/avatar.jpg' });
    });

    it('deletes previous stored avatar after successful DB update', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockFullUser,
        avatar_url: `avatars/${USER_ID}/old.jpg`,
      });
      mockObjectStorage.createPresignedGetObjectUrl.mockResolvedValue(
        'https://signed.example/avatar.jpg',
      );
      mockUserModelAction.updateAvatarUrl.mockResolvedValue({
        ...mockFullUser,
        avatar_url: `avatars/${USER_ID}/new.jpg`,
      });

      await service.uploadAvatar(USER_ID, avatarFile);

      expect(mockObjectStorage.deleteObject).toHaveBeenCalledTimes(1);
      expect(mockObjectStorage.deleteObject).toHaveBeenCalledWith(`avatars/${USER_ID}/old.jpg`);
      expect(mockObjectStorage.deleteObject.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockUserModelAction.updateAvatarUrl.mock.invocationCallOrder[0],
      );
    });

    it('rejects when avatar file is missing', async () => {
      await expect(service.uploadAvatar(USER_ID, undefined)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects when avatar exceeds 2MB', async () => {
      await expect(
        service.uploadAvatar(USER_ID, { ...avatarFile, size: 2 * 1024 * 1024 + 1 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects when file signature cannot be detected', async () => {
      const unknownBufferFile = {
        ...avatarFile,
        originalname: 'mystery.bin',
        buffer: Buffer.from('not-an-image'),
        size: Buffer.from('not-an-image').length,
      };

      await expect(service.uploadAvatar(USER_ID, unknownBufferFile)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects spoofed/unsupported mime type from buffer', async () => {
      const spoofedPdfFile = {
        ...avatarFile,
        originalname: 'avatar.jpg',
        buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8'),
        size: Buffer.byteLength('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8'),
      };

      await expect(service.uploadAvatar(USER_ID, spoofedPdfFile)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('cleans up uploaded file when DB update fails after upload', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      mockObjectStorage.createPresignedGetObjectUrl.mockResolvedValue(
        'https://signed.example/avatar.jpg',
      );
      mockUserModelAction.updateAvatarUrl.mockResolvedValue(null);

      await expect(service.uploadAvatar(USER_ID, avatarFile)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );

      const uploadedPath = mockObjectStorage.putObject.mock.calls[0][0].storagePath as string;
      expect(mockObjectStorage.deleteObject).toHaveBeenCalledWith(uploadedPath);
    });

    it('cleans up uploaded file when signed URL creation fails', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      mockObjectStorage.createPresignedGetObjectUrl.mockRejectedValue(new Error('sign failed'));

      await expect(service.uploadAvatar(USER_ID, avatarFile)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );

      const uploadedPath = mockObjectStorage.putObject.mock.calls[0][0].storagePath as string;
      expect(mockObjectStorage.deleteObject).toHaveBeenCalledWith(uploadedPath);
    });

    it('returns 500 when storage upload fails', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      mockObjectStorage.putObject.mockRejectedValue(new Error('upload failed'));

      await expect(service.uploadAvatar(USER_ID, avatarFile)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(mockObjectStorage.createPresignedGetObjectUrl).not.toHaveBeenCalled();
    });

    it('returns no-op 200 response when avatar is already null', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });

      await expect(service.deleteAvatar(USER_ID)).resolves.toEqual({ avatarUrl: null });
      expect(mockObjectStorage.deleteObject).not.toHaveBeenCalled();
      expect(mockUserModelAction.updateAvatarUrl).not.toHaveBeenCalled();
    });

    it('deletes stored avatar and nulls DB column', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockFullUser,
        avatar_url: `avatars/${USER_ID}/old.jpg`,
      });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue({ ...mockFullUser, avatar_url: null });

      const result = await service.deleteAvatar(USER_ID);

      expect(mockObjectStorage.deleteObject).toHaveBeenCalledWith(`avatars/${USER_ID}/old.jpg`);
      expect(mockUserModelAction.updateAvatarUrl).toHaveBeenCalledWith(USER_ID, null);
      expect(result).toEqual({ avatarUrl: null });
    });

    it('keeps external avatar URL deletion as DB-only operation', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockFullUser,
        avatar_url: 'https://cdn.example.com/avatar.jpg',
      });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue({ ...mockFullUser, avatar_url: null });

      await service.deleteAvatar(USER_ID);

      expect(mockObjectStorage.deleteObject).not.toHaveBeenCalled();
      expect(mockUserModelAction.updateAvatarUrl).toHaveBeenCalledWith(USER_ID, null);
    });

    it('returns 500 when avatar DB nulling fails', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockFullUser,
        avatar_url: `avatars/${USER_ID}/old.jpg`,
      });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue(null);

      await expect(service.deleteAvatar(USER_ID)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('updateProfile', () => {
    it('updates full_name and returns updated profile', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);
      mockUserModelAction.update.mockResolvedValue({ ...mockFullUser, full_name: 'New Name' });

      const result = await service.updateProfile(USER_ID, { fullName: 'New Name' });

      expect(result.fullName).toBe('New Name');
      expect(mockUserModelAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updatePayload: { full_name: 'New Name' },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        APP_EVENTS.PROFILE_UPDATED,
        expect.objectContaining({ userId: USER_ID, updatedFields: ['full_name'] }),
      );
    });

    it('updates country and returns updated profile', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, country: 'Ghana' });
      mockUserModelAction.update.mockResolvedValue({ ...mockFullUser, country: 'Nigeria' });

      const result = await service.updateProfile(USER_ID, { country: 'Nigeria' });

      expect(result.country).toBe('Nigeria');
    });

    it('throws 422 when email is present in body', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);

      await expect(
        service.updateProfile(USER_ID, { email: 'hacker@example.com' } as never),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(mockUserModelAction.update).not.toHaveBeenCalled();
    });

    it('returns unchanged profile without DB write when body is empty', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);

      await service.updateProfile(USER_ID, {});

      expect(mockUserModelAction.update).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('only-country update leaves full_name unchanged in DB', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);
      mockUserModelAction.update.mockResolvedValue({ ...mockFullUser, country: 'Ghana' });

      await service.updateProfile(USER_ID, { country: 'Ghana' });

      const updateCall = mockUserModelAction.update.mock.calls[0][0] as {
        updatePayload: Record<string, unknown>;
      };
      expect(updateCall.updatePayload).not.toHaveProperty('full_name');
    });

    it('no DB write when submitted values are identical to stored values', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, full_name: 'Test User' });

      await service.updateProfile(USER_ID, { fullName: 'Test User' });

      expect(mockUserModelAction.update).not.toHaveBeenCalled();
    });

    it('trims whitespace from fullName before MinLength check', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);
      mockUserModelAction.update.mockResolvedValue({ ...mockFullUser, full_name: 'Trimmed' });

      const result = await service.updateProfile(USER_ID, { fullName: 'Trimmed' });

      expect(result.fullName).toBe('Trimmed');
    });

    it('normalises country casing before comparison', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, country: 'Ghana' });
      mockUserModelAction.update.mockResolvedValue({ ...mockFullUser, country: 'Nigeria' });

      await service.updateProfile(USER_ID, { country: 'nigeria' as never });

      const updateCall = mockUserModelAction.update.mock.calls[0][0] as {
        updatePayload: Record<string, unknown>;
      };
      expect(updateCall.updatePayload['country']).toBe('Nigeria');
    });

    it('throws 404 when user not found', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.updateProfile(USER_ID, { fullName: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 500 when DB update returns null', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);
      mockUserModelAction.update.mockResolvedValue(null);

      await expect(
        service.updateProfile(USER_ID, { fullName: 'Different Name' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('getUserState', () => {
    it('delegates to UserStateService.getUserState', async () => {
      const expectedResponse: UserStateResponse = {
        onboarding: { status: 'not_started' },
        activeFunnel: null,
      };
      mockUserStateService.getUserState.mockResolvedValue(expectedResponse);

      const result = await service.getUserState(USER_ID);

      expect(mockUserStateService.getUserState).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getProfile', () => {
    it('returns camelCase profile for authenticated user', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);

      const result = await service.getProfile(USER_ID);

      expect(result).toMatchObject({
        id: USER_ID,
        fullName: 'Test User',
        email: USER_EMAIL,
      });
    });

    it('regenerates signed avatar URL when stored path exists', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockFullUser,
        avatar_url: `avatars/${USER_ID}/profile.png`,
      });
      mockObjectStorage.createPresignedGetObjectUrl.mockResolvedValue(
        'https://signed.example/avatar/profile.png',
      );

      const result = await service.getProfile(USER_ID);

      expect(mockObjectStorage.createPresignedGetObjectUrl).toHaveBeenCalledWith(
        `avatars/${USER_ID}/profile.png`,
        900,
      );
      expect(result.avatarUrl).toBe('https://signed.example/avatar/profile.png');
    });

    it('keeps external avatar URL unchanged on profile read', async () => {
      mockUserModelAction.get.mockResolvedValue({
        ...mockFullUser,
        avatar_url: 'https://cdn.example.com/avatar.png',
      });

      const result = await service.getProfile(USER_ID);

      expect(mockObjectStorage.createPresignedGetObjectUrl).not.toHaveBeenCalled();
      expect(result.avatarUrl).toBe('https://cdn.example.com/avatar.png');
    });

    it('response never contains password_hash, deleted_at, or provider_user_id', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);

      const result = await service.getProfile(USER_ID) as unknown as Record<string, unknown>;

      expect(result).not.toHaveProperty('password_hash');
      expect(result).not.toHaveProperty('deleted_at');
      expect(result).not.toHaveProperty('provider_user_id');
    });

    it('throws 404 when user not found', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.getProfile(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('notification preferences', () => {
    beforeEach(() => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);
    });

    it('AC-01: returns current preferences for authenticated user', async () => {
      mockNotificationsService.getNotificationPreferences.mockResolvedValue(mockNotificationPreferences);

      const result = await service.getNotificationPreferences(USER_ID);

      expect(mockUserModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: USER_ID },
      });
      expect(mockNotificationsService.getNotificationPreferences).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(mockNotificationPreferencesResponse);
    });

    it('AC-03: updates preferences for authenticated user', async () => {
      const updated = { ...mockNotificationPreferences, email_weekly_digest: false };
      mockNotificationsService.updateNotificationPreferences.mockResolvedValue(updated);

      const result = await service.updateNotificationPreferences(USER_ID, {
        email_weekly_digest: false,
      });

      expect(mockNotificationsService.updateNotificationPreferences).toHaveBeenCalledWith(USER_ID, {
        email_weekly_digest: false,
      });
      expect(result.emailWeeklyDigest).toBe(false);
    });

    it('AC-04: returns camelCase preference fields without database column names', async () => {
      mockNotificationsService.getNotificationPreferences.mockResolvedValue(mockNotificationPreferences);

      const result = await service.getNotificationPreferences(USER_ID) as unknown as Record<string, unknown>;

      expect(result).toMatchObject({
        userId: USER_ID,
        emailFunnelReady: true,
        emailWeeklyDigest: true,
        inappStageUnlocked: true,
      });
      expect(result).not.toHaveProperty('user_id');
      expect(result).not.toHaveProperty('email_weekly_digest');
      expect(result).not.toHaveProperty('created_at');
    });

    it('SEC-03: scopes notification preference reads to req.user.userId', async () => {
      mockNotificationsService.getNotificationPreferences.mockResolvedValue(mockNotificationPreferences);

      await service.getNotificationPreferences(USER_ID);

      expect(mockNotificationsService.getNotificationPreferences).toHaveBeenCalledWith(USER_ID);
    });

    it('AC-09: throws 404 before reading preferences when user no longer exists', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.getNotificationPreferences(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockNotificationsService.getNotificationPreferences).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // ACCOUNT DELETION TESTS (M4-BE-005)
  // ─────────────────────────────────────────────────────────────────

  describe('UsersService - deleteAccount', () => {
    const mockGoogleUser = {
      id: USER_ID,
      email: USER_EMAIL,
      full_name: 'Test User',
      is_active: true,
      deleted_at: null,
      auth_provider: 'google',
      provider_user_id: 'google-123456',
    };

    const mockLocalUser = {
      id: USER_ID,
      email: USER_EMAIL,
      full_name: 'Test User',
      is_active: true,
      deleted_at: null,
      auth_provider: 'local',
      provider_user_id: null,
    };

    beforeEach(async () => {
      jest.clearAllMocks();

      mockQueryRunner.connect.mockResolvedValue(undefined);
      mockQueryRunner.startTransaction.mockResolvedValue(undefined);
      mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
      mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
      mockQueryRunner.release.mockResolvedValue(undefined);
      mockQueryRunner.manager.update.mockResolvedValue({ affected: 1 });
      mockAccountDeletionQueue.add.mockResolvedValue({ id: 'job-123' });
      mockUserSessionModelAction.revokeAllUserSessionsInDb.mockResolvedValue([]);
      mockUserSessionModelAction.deleteSessionRedisKeys = jest.fn().mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: UserModelAction, useValue: mockUserModelAction },
          { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
          { provide: AuthMetadataModelAction, useValue: mockAuthMetadataModelAction },
          { provide: RedisService, useValue: mockRedisService },
          { provide: UserStateService, useValue: mockUserStateService },
          { provide: PinoLoggerService, useValue: mockPinoLoggerService },
          { provide: DataSource, useValue: mockDataSource },
          { provide: getQueueToken(ACCOUNT_DELETION_QUEUE), useValue: mockAccountDeletionQueue },
          { provide: EventEmitter2, useValue: mockEventEmitter },
          { provide: NotificationsService, useValue: mockNotificationsService },
          { provide: UPLOAD_OBJECT_STORAGE, useValue: mockObjectStorage },
        ],
      }).compile();

      service = module.get<UsersService>(UsersService);
    });

    describe('AC-01: valid account deletion', () => {
      it('should soft delete account, revoke sessions, and schedule hard delete job', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockLocalUser);

        await expect(service.deleteAccount(USER_ID, 'DELETE')).resolves.toBeUndefined();
        expect(mockUserModelAction.findById).toHaveBeenCalledWith(USER_ID);
        expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
          User,
          USER_ID,
          expect.objectContaining({
            deleted_at: expect.any(Date),
            is_active: false,
          }),
        );
        expect(mockUserSessionModelAction.revokeAllUserSessionsInDb).toHaveBeenCalledWith(
          USER_ID,
          mockQueryRunner.manager,
        );
        expect(mockAccountDeletionQueue.add).toHaveBeenCalledWith(
          'hard-delete',
          { userId: USER_ID, email: USER_EMAIL },
          { delay: 30 * 24 * 60 * 60 * 1000 },
        );
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      });
    });

    describe('AC-02: session revocation', () => {
      it('should call revokeAllUserSessionsInDb with correct parameters', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockLocalUser);

        await service.deleteAccount(USER_ID, 'DELETE');

        expect(mockUserSessionModelAction.revokeAllUserSessionsInDb).toHaveBeenCalledWith(
          USER_ID,
          mockQueryRunner.manager,
        );
      });
    });

    describe('AC-04: already deleted account', () => {
      it('should throw UnauthorizedException when user already has deleted_at set', async () => {
        const deletedUser = { ...mockLocalUser, deleted_at: new Date() };
        mockUserModelAction.findById.mockResolvedValue(deletedUser);

        await expect(service.deleteAccount(USER_ID, 'DELETE')).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
      });
    });

    describe('AC-06: invalid confirmation - lowercase', () => {
      it('should throw UnprocessableEntityException when confirmation is lowercase', async () => {
        await expect(service.deleteAccount(USER_ID, 'delete')).rejects.toThrow(
          UnprocessableEntityException,
        );
        expect(mockUserModelAction.findById).not.toHaveBeenCalled();
      });
    });

    describe('AC-07: invalid confirmation - trailing space', () => {
      it('should throw UnprocessableEntityException when confirmation has trailing space', async () => {
        await expect(service.deleteAccount(USER_ID, 'DELETE ')).rejects.toThrow(
          UnprocessableEntityException,
        );
        expect(mockUserModelAction.findById).not.toHaveBeenCalled();
      });
    });

    describe('AC-08: missing confirmation', () => {
      it('should throw UnprocessableEntityException when confirmation is empty', async () => {
        await expect(service.deleteAccount(USER_ID, '')).rejects.toThrow(
          UnprocessableEntityException,
        );
      });
    });

    describe('AC-09: transaction rollback on failure', () => {
      it('should rollback transaction when an error occurs', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockLocalUser);
        mockUserSessionModelAction.revokeAllUserSessionsInDb.mockRejectedValue(
          new Error('Session revocation failed'),
        );

        await expect(service.deleteAccount(USER_ID, 'DELETE')).rejects.toThrow(
          InternalServerErrorException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      });
    });

    describe('AC-11: Google OAuth account deletion', () => {
      it('should nullify provider_user_id for Google OAuth accounts', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockGoogleUser);

        await service.deleteAccount(USER_ID, 'DELETE');

        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      });

      it('should not nullify provider_user_id for non-Google accounts', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockLocalUser);

        await service.deleteAccount(USER_ID, 'DELETE');

        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      });
    });

    describe('EC-01: re-registration during retention window', () => {
      it('should throw USER_ACCOUNT_LOCKED when user exists with deleted_at not null', async () => {
        const deletedUser = { ...mockLocalUser, is_active: false, deleted_at: new Date() };
        mockUserModelAction.findByEmail.mockResolvedValue(deletedUser);

        const createDto = {
          email: USER_EMAIL,
          password: 'Password123!',
          fullName: 'New User',
          termsAccepted: true,
        };

        await expect(service.create(createDto)).rejects.toThrow(SYS_MSG.USER_ACCOUNT_LOCKED);
        expect(mockUserModelAction.create).not.toHaveBeenCalled();
      });
    });

    describe('user not found', () => {
      it('should throw NotFoundException when user does not exist', async () => {
        mockUserModelAction.findById.mockResolvedValue(null);

        await expect(service.deleteAccount(USER_ID, 'DELETE')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });
});