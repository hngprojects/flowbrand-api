import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { fromBuffer } from 'file-type';
import { QueryFailedError } from 'typeorm';
import * as SYS_MSG from '../../constants/system.messages';
import { UPLOAD_OBJECT_STORAGE } from '../upload/upload.types';
import { UserModelAction } from './actions/user.action';
import { UsersService } from './users.service';
import { UserStateService } from './user-state.service';
import { AvatarMimeType } from './enums/avatar-mime-type.enum';
import { User } from './entities/user.entity';
import { UserStateResponse } from './interfaces/user-state.interface';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
jest.mock('file-type', () => ({
  fromBuffer: jest.fn(),
}));

const USER_ID = 'user-uuid-001';
const USER_EMAIL = 'test@example.com';

const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  updateAvatarUrl: jest.fn(),
  delete: jest.fn(),
};

const mockUserStateService = {
  getUserState: jest.fn(),
  invalidateUserStateCache: jest.fn(),
};

const mockObjectStorage = {
  putObject: jest.fn(),
  getObject: jest.fn(),
  deleteObject: jest.fn(),
  createPresignedGetObjectUrl: jest.fn(),
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
        { provide: UPLOAD_OBJECT_STORAGE, useValue: mockObjectStorage },
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

    it('creates user', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      mockUserModelAction.create.mockResolvedValue(mockUser());
      await expect(service.create(createDto)).resolves.toEqual(mockUser());
    });

    it('throws conflict when email exists', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(mockUser());
      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws conflict on duplicate db key', async () => {
      mockUserModelAction.findByEmail.mockResolvedValue(null);
      const dbError = Object.assign(new QueryFailedError('', [], new Error()), {
        driverError: { code: '23505' },
      });
      mockUserModelAction.create.mockRejectedValue(dbError);
      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getUserState', () => {
    it('delegates to UserStateService', async () => {
      const expected: UserStateResponse = { onboarding: { status: 'not_started' }, activeFunnel: null };
      mockUserStateService.getUserState.mockResolvedValue(expected);
      await expect(service.getUserState(USER_ID)).resolves.toEqual(expected);
    });
  });

  describe('uploadAvatar', () => {
    const fromBufferMock = fromBuffer as jest.MockedFunction<typeof fromBuffer>;
    const avatarFile = {
      originalname: 'my-avatar.jpg',
      size: 512_000,
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'application/octet-stream',
    } as Express.Multer.File;

    it('uploads valid avatar and returns signed URL', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      fromBufferMock.mockResolvedValue({ ext: 'jpg', mime: AvatarMimeType.JPEG });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue({ ...mockFullUser, avatar_url: 'avatars/u/new.jpg' });
      mockObjectStorage.createPresignedGetObjectUrl.mockResolvedValue('https://signed.example/avatar.jpg');

      const result = await service.uploadAvatar(USER_ID, avatarFile);
      expect(result).toEqual({ avatarUrl: 'https://signed.example/avatar.jpg' });
      expect(mockObjectStorage.putObject).toHaveBeenCalled();
    });

    it('rejects missing file with 422', async () => {
      await expect(service.uploadAvatar(USER_ID, undefined)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects oversized file with 422', async () => {
      await expect(
        service.uploadAvatar(USER_ID, { ...avatarFile, size: 2_097_153 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects spoofed mime with 422', async () => {
      fromBufferMock.mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' });
      await expect(service.uploadAvatar(USER_ID, avatarFile)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rolls back object when DB update fails', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      fromBufferMock.mockResolvedValue({ ext: 'webp', mime: AvatarMimeType.WEBP });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue(null);

      await expect(service.uploadAvatar(USER_ID, avatarFile)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(mockObjectStorage.deleteObject).toHaveBeenCalled();
    });
  });

  describe('deleteAvatar', () => {
    it('deletes stored avatar and nulls db field', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: 'avatars/u/a.jpg' });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      await expect(service.deleteAvatar(USER_ID)).resolves.toEqual({ avatarUrl: null });
    });

    it('returns no-op when avatar is already null', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: null });
      await expect(service.deleteAvatar(USER_ID)).resolves.toEqual({ avatarUrl: null });
    });

    it('throws 500 when null update fails', async () => {
      mockUserModelAction.get.mockResolvedValue({ ...mockFullUser, avatar_url: 'avatars/u/a.jpg' });
      mockUserModelAction.updateAvatarUrl.mockResolvedValue(null);
      await expect(service.deleteAvatar(USER_ID)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('updateProfile', () => {
    it('throws 422 when email in body', async () => {
      mockUserModelAction.get.mockResolvedValue(mockFullUser);
      await expect(
        service.updateProfile(USER_ID, { email: 'x@example.com' } as never),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 404 when user not found', async () => {
      mockUserModelAction.get.mockResolvedValue(null);
      await expect(service.updateProfile(USER_ID, { fullName: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
