import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomThrottlerGuard } from './throttler.guard';
import { THROTTLE_MESSAGE_KEY } from '../decorators/throttle-message.decorator';

function buildGuard(reflectorReturnValue: string | undefined): CustomThrottlerGuard {
  const mockReflector = {
    getAllAndOverride: jest.fn().mockReturnValue(reflectorReturnValue),
  } as unknown as Reflector;

  return new CustomThrottlerGuard(
    {} as never,
    {} as never,
    mockReflector,
  );
}

function buildContext(handler = jest.fn(), classRef = jest.fn()): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('CustomThrottlerGuard.throwThrottlingException', () => {
  it('rejects with HttpException carrying the message set by @ThrottleMessage on the handler', async () => {
    const guard = buildGuard('Too many registration attempts. Please try again in an hour.');
    const ctx = buildContext();

    await expect(guard['throwThrottlingException'](ctx)).rejects.toThrow(HttpException);
    await expect(guard['throwThrottlingException'](ctx)).rejects.toThrow(
      'Too many registration attempts. Please try again in an hour.',
    );
  });

  it('rejects with status 429', async () => {
    const guard = buildGuard('some message');
    const ctx = buildContext();

    const caught = await guard['throwThrottlingException'](ctx).catch((e: unknown) => e);

    expect((caught as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('falls back to the default message when no @ThrottleMessage metadata is present', async () => {
    const guard = buildGuard(undefined);
    const ctx = buildContext();

    await expect(guard['throwThrottlingException'](ctx)).rejects.toThrow(
      'Too many requests. Please try again later.',
    );
  });

  it('reads metadata from handler then class via getAllAndOverride', async () => {
    const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue('msg') } as unknown as Reflector;
    const guard = new CustomThrottlerGuard({} as never, {} as never, mockReflector);
    const handler = jest.fn();
    const classRef = jest.fn();
    const ctx = buildContext(handler, classRef);

    await guard['throwThrottlingException'](ctx).catch(() => { /* expected rejection */ });

    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(THROTTLE_MESSAGE_KEY, [handler, classRef]);
  });
});
