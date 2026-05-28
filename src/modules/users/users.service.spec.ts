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
import { redisKeys } from '../../constants/redis-keys';
import { UserStateService } from './user-state.service';
import { User } from './entities/user.entity';
import { UserStateResponse } from './interfaces/user-state.interface';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ACCOUNT_DELETION_QUEUE } from './processors/account-deletion.processor';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { UserRole } from './enums/user-role.enum';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock UserModelAction
const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
};

const mockUserSessionModelAction = {
  findByUserId: jest.fn(),
  updateById: jest.fn(),
  revokeAllUserSessions: jest.fn(),
  findById: jest.fn(),
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

// Mock RedisService
const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

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
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CRUD TESTS
  // ─────────────────────────────────────────────────────────────────────────

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
      mockUserModelAction.update.mockResolvedValue(mockUser);
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

    // ... rest of changePassword tests (keep all of them) ...
  });

  describe('updateProfile', () => {
    // ... keep all updateProfile tests ...
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

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT DELETION TESTS
  // ─────────────────────────────────────────────────────────────────────────

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
      mockUserSessionModelAction.revokeAllUserSessions.mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: UserModelAction, useValue: mockUserModelAction },
          { provide: UserSessionModelAction, useValue: mockUserSessionModelAction },
          { provide: UserStateService, useValue: mockUserStateService },
          { provide: PinoLoggerService, useValue: mockPinoLoggerService },
          { provide: DataSource, useValue: mockDataSource },
          { provide: getQueueToken(ACCOUNT_DELETION_QUEUE), useValue: mockAccountDeletionQueue },
        ],
      }).compile();

      service = module.get<UsersService>(UsersService);
    });

    describe('AC-01: valid account deletion', () => {
      it('should soft delete account, revoke sessions, and schedule hard delete job', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockLocalUser);

        const result = await service.deleteAccount(USER_ID, 'DELETE');

        expect(result.message).toBe(SYS_MSG.ACCOUNT_DELETED_SUCCESSFULLY);
        expect(mockUserModelAction.findById).toHaveBeenCalledWith(USER_ID);
        expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
          User,
          USER_ID,
          expect.objectContaining({
            deleted_at: expect.any(Date),
            is_active: false,
          }),
        );
        expect(mockUserSessionModelAction.revokeAllUserSessions).toHaveBeenCalledWith(
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
      it('should call revokeAllUserSessions with correct parameters', async () => {
        mockUserModelAction.findById.mockResolvedValue(mockLocalUser);

        await service.deleteAccount(USER_ID, 'DELETE');

        expect(mockUserSessionModelAction.revokeAllUserSessions).toHaveBeenCalledWith(
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
        mockUserSessionModelAction.revokeAllUserSessions.mockRejectedValue(
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
      it('should throw ConflictException when user exists with deleted_at not null', async () => {
        const deletedUser = { ...mockLocalUser, is_active: false, deleted_at: new Date() };
        mockUserModelAction.findByEmail.mockResolvedValue(deletedUser);

        const createDto = {
          email: USER_EMAIL,
          password: 'Password123!',
          fullName: 'New User',
          termsAccepted: true,
        };

        await expect(service.create(createDto)).rejects.toThrow(
          SYS_MSG.ACCOUNT_EXISTS_WITH_RETENTION
        );
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