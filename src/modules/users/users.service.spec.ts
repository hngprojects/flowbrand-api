import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import * as SYS_MSG from '../../constants/system.messages';
import { UserModelAction } from './actions/user.action';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

const mockUserModelAction = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
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
});