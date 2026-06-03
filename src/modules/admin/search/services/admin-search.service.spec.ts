import { Test, TestingModule } from '@nestjs/testing';
import { AdminSearchService } from './admin-search.service';
import { AdminSearchModelAction } from '../actions/admin-search.action';
import { User } from '../../../users/entities/user.entity';

const mockSearchAction = {
  searchUsers: jest.fn(),
};

describe('AdminSearchService', () => {
  let service: AdminSearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSearchService,
        { provide: AdminSearchModelAction, useValue: mockSearchAction },
      ],
    }).compile();

    service = module.get<AdminSearchService>(AdminSearchService);
  });

  it('should map and return search results correctly (AC-01, AC-05, FR-2, FR-5)', async () => {
    const mockUsers = [
      {
        id: 'user-1',
        full_name: 'John Doe',
        email: 'john.doe@example.com',
        is_active: true,
        deleted_at: null,
      },
      {
        id: 'user-2',
        full_name: 'Jane Smith',
        email: 'jane.smith@example.com',
        is_active: false,
        deleted_at: null,
      },
      {
        id: 'user-3',
        full_name: 'Deleted User',
        email: 'deleted@example.com',
        is_active: true,
        deleted_at: new Date(),
      },
    ] as User[];

    mockSearchAction.searchUsers.mockResolvedValue([mockUsers, 3]);

    const result = await service.search('john');

    expect(result).toEqual({
      query: 'john',
      total: 3,
      results: [
        {
          type: 'user',
          id: 'user-1',
          display_name: 'John Doe',
          displayName: 'John Doe',
          email: 'john.doe@example.com',
          status: 'active',
          plan: null,
        },
        {
          type: 'user',
          id: 'user-2',
          display_name: 'Jane Smith',
          displayName: 'Jane Smith',
          email: 'jane.smith@example.com',
          status: 'inactive',
          plan: null,
        },
        {
          type: 'user',
          id: 'user-3',
          display_name: 'Deleted User',
          displayName: 'Deleted User',
          email: 'deleted@example.com',
          status: 'deleted',
          plan: null,
        },
      ],
    });
    expect(mockSearchAction.searchUsers).toHaveBeenCalledWith('john');
  });

  it('should return empty results when no matches found (AC-03, FR-4)', async () => {
    mockSearchAction.searchUsers.mockResolvedValue([[], 0]);

    const result = await service.search('nonexistent');

    expect(result).toEqual({
      query: 'nonexistent',
      total: 0,
      results: [],
    });
  });
});