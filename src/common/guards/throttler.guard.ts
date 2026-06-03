import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLE_MESSAGE_KEY } from '../decorators/throttle-message.decorator';

const THROTTLE_DEFAULT_MESSAGE = 'Too many requests. Please try again later.';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const message =
      this.reflector.getAllAndOverride<string>(THROTTLE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? THROTTLE_DEFAULT_MESSAGE;

    return Promise.reject(new HttpException(message, HttpStatus.TOO_MANY_REQUESTS));
  }
}
