import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import * as SYS_MSG from '../../constants/system.messages';

const mockUsersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  getUserState: jest.fn(),
  uploadAvatar: jest.fn(),
  deleteAvatar: jest.fn(),
};

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mockAuthUser = {
  userId: USER_ID,
  sub: USER_ID,
  email: 'jane@example.com',
  sessionId: 'sess-123',
};

const mockProfile = {
  id: USER_ID,
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  country: 'Nigeria',
  avatarUrl: null,
  authProvider: 'local',
  isVerified: true,
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-06-01'),
};

describe('UsersController — profile endpoints', () => {
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('GET /users/me', () => {
    it('returns 200 with profile data', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockProfile);
      const result = await controller.getProfile(mockAuthUser);
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_RETRIEVED_SUCCESSFULLY,
        data: mockProfile,
      });
    });
  });

  describe('PATCH /users/me', () => {
    it('updates full_name and returns 200', async () => {
      const updated = { ...mockProfile, fullName: 'Jane Updated' };
      mockUsersService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(mockAuthUser, {
        fullName: 'Jane Updated',
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(USER_ID, {
        fullName: 'Jane Updated',
      });
    });
  });

  describe('POST /users/me/avatar', () => {
    it('returns 200 with uploaded avatar URL', async () => {
      const avatarFile = { buffer: Buffer.from('img'), size: 1024 } as Express.Multer.File;
      const payload = { avatarUrl: 'https://signed.example/avatar.webp' };
      mockUsersService.uploadAvatar.mockResolvedValue(payload);

      const result = await controller.uploadAvatar(mockAuthUser, avatarFile);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_AVATAR_UPLOADED_SUCCESSFULLY,
        data: payload,
      });
    });
  });

  describe('DELETE /users/me/avatar', () => {
    it('returns 200 with avatarUrl null', async () => {
      mockUsersService.deleteAvatar.mockResolvedValue({ avatarUrl: null });
      const result = await controller.deleteAvatar(mockAuthUser);
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_AVATAR_REMOVED_SUCCESSFULLY,
        data: { avatarUrl: null },
      });
    });
  });
});
