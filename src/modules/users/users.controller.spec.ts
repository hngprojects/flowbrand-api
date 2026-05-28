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

      const result = await controller.getProfile(mockAuthUser) as unknown as {
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

      const result = await controller.updateProfile(mockAuthUser, { fullName: 'Jane Updated' });

      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_UPDATED_SUCCESSFULLY,
        data: updated,
      });
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(USER_ID, {
        fullName: 'Jane Updated',
      });
    });

    it('updates country and returns 200', async () => {
      const updated = { ...mockProfile, country: 'Ghana' };
      mockUsersService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(mockAuthUser, { country: 'Ghana' });

      expect(result).toMatchObject({
        statusCode: HttpStatus.OK,
        message: SYS_MSG.PROFILE_UPDATED_SUCCESSFULLY,
      });
    });

    it('empty body returns 200 with unchanged profile', async () => {
      mockUsersService.updateProfile.mockResolvedValue(mockProfile);

      const result = await controller.updateProfile(mockAuthUser, {});

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(USER_ID, {});
    });

    it('passes userId from JWT — never from path param', async () => {
      mockUsersService.updateProfile.mockResolvedValue(mockProfile);

      await controller.updateProfile(mockAuthUser, {});

      // First arg to updateProfile must be the JWT userId, not a path param
      expect(mockUsersService.updateProfile.mock.calls[0][0]).toBe(USER_ID);
    });
  });
});