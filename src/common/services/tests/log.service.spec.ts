import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Request } from 'express';
import { AdminLog } from '../../../modules/admin/logs/entities/admin-log.entity';
import { AdminLogActionType, AdminLogStatus } from '../../../modules/admin/logs/enums/admin-log.enum';
import { LogService } from '../log.service';

const mockAdminLogRepository = {
  create: jest.fn(),
  save: jest.fn(),
};

/** Resolves after pending setImmediate callbacks have run. */
const flushImmediates = () => new Promise<void>((resolve) => setImmediate(resolve));

const makeRequest = (overrides: Partial<Request> = {}): Request =>
  ({ headers: {}, ip: '127.0.0.1', ...overrides }) as Request;

describe('LogService', () => {
  let service: LogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockAdminLogRepository.create.mockImplementation((entity: unknown) => entity);
    mockAdminLogRepository.save.mockResolvedValue({ id: 'log-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        { provide: getRepositoryToken(AdminLog), useValue: mockAdminLogRepository },
      ],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('log', () => {
    it('persists a row with the provided fields', async () => {
      service.log(
        'user-1',
        AdminLogActionType.LOGIN,
        'User logged in',
        makeRequest(),
        AdminLogStatus.SUCCESS,
      );
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith({
        user_id: 'user-1',
        action_type: AdminLogActionType.LOGIN,
        description: 'User logged in',
        ip_address: '127.0.0.1',
        status: AdminLogStatus.SUCCESS,
        metadata: {},
      });
    });

    it('AC-04 / FR-2: returns before the database write starts', () => {
      service.log('user-1', AdminLogActionType.LOGIN, 'x', null, AdminLogStatus.SUCCESS);

      // log() has already returned; the deferred write has not run yet.
      expect(mockAdminLogRepository.save).not.toHaveBeenCalled();
    });

    it('EC-02: stores a null user_id for unauthenticated actions', async () => {
      service.log(null, AdminLogActionType.LOGIN, 'Failed login', null, AdminLogStatus.FAILED);
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: null, status: AdminLogStatus.FAILED }),
      );
    });

    // --- EC-01 / AC-07: silent failure ---

    it('AC-07: a rejected save never throws and is reported via Logger.error', async () => {
      mockAdminLogRepository.save.mockRejectedValue(new Error('db down'));

      expect(() =>
        service.log('user-1', AdminLogActionType.SIGNUP, 'x', null, AdminLogStatus.SUCCESS),
      ).not.toThrow();
      await flushImmediates();

      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('AC-07: a synchronous repository explosion is also swallowed', async () => {
      mockAdminLogRepository.create.mockImplementation(() => {
        throw new Error('sync failure');
      });

      expect(() =>
        service.log('user-1', AdminLogActionType.SIGNUP, 'x', null, AdminLogStatus.SUCCESS),
      ).not.toThrow();
      await flushImmediates();

      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    // --- FR-3: ip extraction ---

    it('FR-3: stores null ip_address when req is null (non-HTTP action)', async () => {
      service.log('user-1', AdminLogActionType.FUNNEL_GENERATED, 'x', null, AdminLogStatus.SUCCESS);
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ip_address: null }),
      );
    });

    it('FR-3: prefers the first x-forwarded-for entry over req.ip', async () => {
      const req = makeRequest({
        headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      } as Partial<Request>);

      service.log('user-1', AdminLogActionType.LOGIN, 'x', req, AdminLogStatus.SUCCESS);
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ip_address: '203.0.113.9' }),
      );
    });

    it('FR-3: falls back to req.ip when no forwarding header is present', async () => {
      service.log(
        'user-1',
        AdminLogActionType.LOGIN,
        'x',
        makeRequest({ ip: '198.51.100.4' }),
        AdminLogStatus.SUCCESS,
      );
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ip_address: '198.51.100.4' }),
      );
    });

    // --- FR-4 / AC-05: metadata scrubbing ---

    it('AC-05: replaces a password key with [REDACTED]', async () => {
      service.log('user-1', AdminLogActionType.SIGNUP, 'x', null, AdminLogStatus.SUCCESS, {
        password: 'SuperSecret1!',
        email: 'a@b.com',
      });
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { password: '[REDACTED]', email: 'a@b.com' },
        }),
      );
    });

    it('FR-4: redacts keys that merely contain a sensitive fragment', async () => {
      service.log('user-1', AdminLogActionType.LOGIN, 'x', null, AdminLogStatus.SUCCESS, {
        access_token: 'jwt-value',
        password_hash: 'bcrypt-value',
        clientSecret: 'oauth-value',
        card_number: '4111111111111111',
        safe_field: 'kept',
      });
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            access_token: '[REDACTED]',
            password_hash: '[REDACTED]',
            clientSecret: '[REDACTED]',
            card_number: '[REDACTED]',
            safe_field: 'kept',
          },
        }),
      );
    });

    it('FR-4: scrubs nested objects and arrays', async () => {
      service.log('user-1', AdminLogActionType.LOGIN, 'x', null, AdminLogStatus.SUCCESS, {
        context: { inner: { token: 'abc', label: 'ok' } },
        attempts: [{ pin: '1234' }, { note: 'fine' }],
      });
      await flushImmediates();

      expect(mockAdminLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            context: { inner: { token: '[REDACTED]', label: 'ok' } },
            attempts: [{ pin: '[REDACTED]' }, { note: 'fine' }],
          },
        }),
      );
    });

    it('EC-03: truncates any single string value to 500 characters', async () => {
      const longText = 'a'.repeat(2000);

      service.log('user-1', AdminLogActionType.DOCUMENT_UPLOADED, 'x', null, AdminLogStatus.SUCCESS, {
        parsed_text: longText,
      });
      await flushImmediates();

      const payload = mockAdminLogRepository.create.mock.calls[0][0] as {
        metadata: { parsed_text: string };
      };
      expect(payload.metadata.parsed_text).toHaveLength(500);
      expect(payload.metadata.parsed_text).toBe('a'.repeat(500));
    });
  });
});
