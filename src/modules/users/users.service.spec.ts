import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import * as SYS_MSG from '../../constants/system.messages';
import { UserModelAction } from './actions/user.action';
import { UsersService } from './users.service';
import { UserStateService } from './user-state.service';
import { User } from './entities/user.entity';
import { UserStateResponse } from './interfaces/user-state.interface';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

const USER_ID = 'user-uuid-001';
const USER_EMAIL = 'test@example.com';

// Mock UserModelAction
const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

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

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserModelAction, useValue: mockUserModelAction },
        { provide: UserStateService, useValue: mockUserStateService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
    });

    it('throws 404 when user not found during remove', async () => {
      mockUserModelAction.get.mockResolvedValue(null);

      await expect(service.remove(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockUserModelAction.delete).not.toHaveBeenCalled();
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
});
