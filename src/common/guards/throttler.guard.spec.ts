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
  it('throws HttpException with the message set by @ThrottleMessage on the handler', () => {
    const guard = buildGuard('Too many registration attempts. Please try again in an hour.');
    const ctx = buildContext();

    expect(() => guard['throwThrottlingException'](ctx)).toThrow(HttpException);
    expect(() => guard['throwThrottlingException'](ctx)).toThrow(
      'Too many registration attempts. Please try again in an hour.',
    );
  });

  it('throws HttpException with status 429', () => {
    const guard = buildGuard('some message');
    const ctx = buildContext();

    let caught: HttpException | undefined;
    try {
      guard['throwThrottlingException'](ctx);
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('falls back to the default message when no @ThrottleMessage metadata is present', () => {
    const guard = buildGuard(undefined);
    const ctx = buildContext();

    expect(() => guard['throwThrottlingException'](ctx)).toThrow(
      'Too many requests. Please try again later.',
    );
  });

  it('reads metadata from handler then class via getAllAndOverride', () => {
    const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue('msg') } as unknown as Reflector;
    const guard = new CustomThrottlerGuard({} as never, {} as never, mockReflector);
    const handler = jest.fn();
    const classRef = jest.fn();
    const ctx = buildContext(handler, classRef);

    try { guard['throwThrottlingException'](ctx); } catch { /* expected */ }

    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(THROTTLE_MESSAGE_KEY, [handler, classRef]);
  });
});
