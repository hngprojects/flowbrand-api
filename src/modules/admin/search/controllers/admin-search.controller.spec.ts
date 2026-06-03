import { HttpStatus, UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';
import { AdminSearchController } from './admin-search.controller';
import { AdminSearchService } from '../services/admin-search.service';
import { AdminSearchQueryDto } from '../dto/admin-search-query.dto';

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
          email: 'john.doe@example.com',
          status: 'active' as const,
          plan: null,
        },
      ],
      query: 'john',
      total: 1,
    };

    mockSearchService.search.mockResolvedValue(mockResponse);

    const result = await controller.search({ q: 'john' });

    expect(result).toEqual({
      statusCode: HttpStatus.OK,
      message: expect.any(String),
      data: mockResponse,
    });
    expect(mockSearchService.search).toHaveBeenCalledWith('john');
  });

  describe('ValidationPipe', () => {
    const createValidationPipe = () =>
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
        expectedType: AdminSearchQueryDto,
        validationError: { target: false, value: false },
        exceptionFactory: (errors: ValidationError[]) =>
          new UnprocessableEntityException({
            success: false,
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'UnprocessableEntityException',
            message: 'Validation failed',
            details: errors.map(err => {
              const constraints = err.constraints ? Object.values(err.constraints) : [];
              return `${err.property}: ${constraints.join(', ')}`;
            }),
          }),
      });

    it('should throw HTTP 422 if query parameter is shorter than 2 characters (AC-02, EC-03)', async () => {
      await expect(
        createValidationPipe().transform(
          { q: 'a' },
          { type: 'query', metatype: AdminSearchQueryDto, data: 'q' },
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should accept query parameter if 2 or more characters long', async () => {
      const result = await createValidationPipe().transform(
        { q: 'ab' },
        { type: 'query', metatype: AdminSearchQueryDto, data: 'q' },
      );
      expect(result).toEqual({ q: 'ab' });
    });
  });
});