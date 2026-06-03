import { HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import { AdminSearchController } from '../controllers/admin-search.controller';
import { AdminSearchService } from '../services/admin-search.service';

const mockSearchService = {
  search: jest.fn(),
};

describe('AdminSearchController', () => {
  let controller: AdminSearchController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminSearchController(mockSearchService as unknown as AdminSearchService);
  });

  it('should search successfully (AC-01, AC-03)', async () => {
    const mockResponse = {
      results: [
        {
          type: 'user' as const,
          id: 'user-1',
          display_name: 'John Doe',
          displayName: 'John Doe',
          email: 'john.doe@example.com',
          status: 'active' as const,
          plan: null,
        },
      ],
      query: 'john',
      total: 1,
    };

    mockSearchService.search.mockResolvedValue(mockResponse);

    const result = await controller.search('john');

    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: expect.any(String),
      data: mockResponse,
    });
    expect(mockSearchService.search).toHaveBeenCalledWith('john');
  });

  it('should throw HTTP 422 if query parameter is shorter than 2 characters (AC-02, EC-03)', async () => {
    await expect(controller.search('a')).rejects.toThrow(UnprocessableEntityException);
    await expect(controller.search(undefined)).rejects.toThrow(UnprocessableEntityException);
    await expect(controller.search('  ')).rejects.toThrow(UnprocessableEntityException);
  });
});