import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
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
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
  getUserState: jest.fn(),
  uploadAvatar: jest.fn(),
  deleteAvatar: jest.fn(),
};

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const MOCK_REQ = { ip: '127.0.0.1', headers: {} } as unknown as Request;

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

const mockNotificationPreferences = {
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

  // GET /users/me
  describe('GET /users/me', () => {
    it('returns 200 with profile data', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(mockAuthUser);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_RETRIEVED_SUCCESSFULLY,
        data: mockProfile,
      });
      expect(mockUsersService.getProfile).toHaveBeenCalledWith(USER_ID);
    });

    it('delegates to service — response shape contains no raw entity', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockProfile);

      const result = (await controller.getProfile(mockAuthUser)) as unknown as {
        data: Record<string, unknown>;
      };

      expect(result.data).not.toHaveProperty('password_hash');
      expect(result.data).not.toHaveProperty('deleted_at');
    });
  });

  // PATCH /users/me
  describe('PATCH /users/me', () => {
    it('updates full_name and returns 200', async () => {
      const updated = { ...mockProfile, fullName: 'Jane Updated' };
      mockUsersService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(mockAuthUser, { fullName: 'Jane Updated' }, MOCK_REQ);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_UPDATED_SUCCESSFULLY,
        data: updated,
      });
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(
        USER_ID,
        { fullName: 'Jane Updated' },
        MOCK_REQ,
      );
    });

    it('updates country and returns 200', async () => {
      const updated = { ...mockProfile, country: 'Ghana' };
      mockUsersService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(mockAuthUser, { country: 'Ghana' }, MOCK_REQ);

      expect(result).toMatchObject({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_UPDATED_SUCCESSFULLY,
      });
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(
        USER_ID,
        { country: 'Ghana' },
        MOCK_REQ,
      );
    });

    it('empty body returns 200 with unchanged profile', async () => {
      mockUsersService.updateProfile.mockResolvedValue(mockProfile);

      const result = await controller.updateProfile(mockAuthUser, {}, MOCK_REQ);

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(USER_ID, {}, MOCK_REQ);
    });

    it('passes userId from JWT — never from path param', async () => {
      mockUsersService.updateProfile.mockResolvedValue(mockProfile);

      await controller.updateProfile(mockAuthUser, {}, MOCK_REQ);

      // First arg to updateProfile must be the JWT userId, not a path param
      expect(mockUsersService.updateProfile.mock.calls[0][0]).toBe(USER_ID);
    });
  });

  describe('notification preferences endpoints', () => {
    it('AC-01: GET returns current notification preferences', async () => {
      mockUsersService.getNotificationPreferences.mockResolvedValue(mockNotificationPreferences);

      const result = await controller.getNotificationPreferences(USER_ID);

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.NOTIFICATION_PREFERENCES_RETRIEVED_SUCCESSFULLY,
        data: mockNotificationPreferences,
      });
      expect(mockUsersService.getNotificationPreferences).toHaveBeenCalledWith(USER_ID);
    });

    it('AC-03: PATCH returns updated notification preferences', async () => {
      const updated = { ...mockNotificationPreferences, emailWeeklyDigest: false };
      mockUsersService.updateNotificationPreferences.mockResolvedValue(updated);

      const result = await controller.updateNotificationPreferences(USER_ID, {
        email_weekly_digest: false,
      });

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.NOTIFICATION_PREFERENCES_UPDATED_SUCCESSFULLY,
        data: updated,
      });
      expect(mockUsersService.updateNotificationPreferences).toHaveBeenCalledWith(USER_ID, {
        email_weekly_digest: false,
      });
    });

    it('AC-05: PATCH empty body delegates to service and returns 200', async () => {
      mockUsersService.updateNotificationPreferences.mockResolvedValue(mockNotificationPreferences);

      const result = await controller.updateNotificationPreferences(USER_ID, {});

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(mockUsersService.updateNotificationPreferences).toHaveBeenCalledWith(USER_ID, {});
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



