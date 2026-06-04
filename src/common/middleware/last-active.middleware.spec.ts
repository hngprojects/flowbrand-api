import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { LastActiveMiddleware } from './last-active.middleware';

// Flushes all pending microtasks so fire-and-forget async work completes before asserting
const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const makeReq = (authHeader?: string): Partial<Request> => ({
  headers: authHeader ? { authorization: authHeader } : {},
});

const mockExecute = jest.fn().mockResolvedValue({ affected: 1 });
const mockQueryBuilder = {
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: mockExecute,
};
const mockDataSource = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
};
const mockJwtService = { verifyAsync: jest.fn() };

describe('LastActiveMiddleware', () => {
  let middleware: LastActiveMiddleware;
  let next: NextFunction;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    next = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LastActiveMiddleware,
        { provide: JwtService, useValue: mockJwtService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    middleware = module.get<LastActiveMiddleware>(LastActiveMiddleware);
  });

  describe('use', () => {
    it('always calls next() synchronously before any async work', () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid' });
      middleware.use(makeReq('Bearer valid.jwt.token') as Request, {} as Response, next);

      // Assert synchronously — next must be called before promises resolve
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() even when there is no Authorization header', () => {
      middleware.use(makeReq() as Request, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() even when verifyAsync throws (invalid token)', () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      middleware.use(makeReq('Bearer bad.token') as Request, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() even when the DB throws', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid' });
      mockExecute.mockRejectedValueOnce(new Error('DB down'));

      middleware.use(makeReq('Bearer valid.jwt.token') as Request, {} as Response, next);

      await flushPromises();

      expect(next).toHaveBeenCalledTimes(1);
    });

    // --- Happy path ---

    it('stamps last_login_at when a valid verified JWT with sub is present', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid-123' });
      middleware.use(makeReq('Bearer valid.jwt.token') as Request, {} as Response, next);

      await flushPromises();

      expect(mockDataSource.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalled();
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('passes the correct userId from the verified JWT sub claim to the WHERE clause', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid-123' });
      middleware.use(makeReq('Bearer valid.jwt.token') as Request, {} as Response, next);

      await flushPromises();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_id = :userId', { userId: 'user-uuid-123' });
    });

    it('verifies the JWT with the access secret — not just decodes it', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid-123' });
      middleware.use(makeReq('Bearer valid.jwt.token') as Request, {} as Response, next);

      await flushPromises();

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        'valid.jwt.token',
        expect.objectContaining({ secret: expect.any(String) }),
      );
    });

    // --- Early return cases — DB must not be called ---

    it('skips DB update when Authorization header is absent', async () => {
      middleware.use(makeReq() as Request, {} as Response, next);

      await flushPromises();

      expect(mockDataSource.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('skips DB update when Authorization scheme is not Bearer', async () => {
      middleware.use(makeReq('Basic dXNlcjpwYXNz') as Request, {} as Response, next);

      await flushPromises();

      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
      expect(mockDataSource.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('skips DB update when verifyAsync throws (forged or expired token)', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      middleware.use(makeReq('Bearer forged.token') as Request, {} as Response, next);

      await flushPromises();

      expect(mockDataSource.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('skips DB update when verifyAsync throws due to token expiry', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      middleware.use(makeReq('Bearer expired.token') as Request, {} as Response, next);

      await flushPromises();

      expect(mockDataSource.createQueryBuilder).not.toHaveBeenCalled();
    });

    // --- Fire-and-forget safety ---

    it('silently swallows DB errors — does not produce an unhandled rejection', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid' });
      mockExecute.mockRejectedValueOnce(new Error('Connection timeout'));

      // If the error were not caught, Jest would detect an unhandled rejection and fail this test
      middleware.use(makeReq('Bearer valid.jwt.token') as Request, {} as Response, next);

      await flushPromises();

      // Reaching here means the error was swallowed
      expect(next).toHaveBeenCalled();
    });

    // --- Security ---

    it('SEC-01: a forged token with a valid sub but bad signature does not trigger a DB write', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      middleware.use(makeReq('Bearer forged.sub.token') as Request, {} as Response, next);

      await flushPromises();

      expect(mockDataSource.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
