import { SetMetadata } from '@nestjs/common';

export const THROTTLE_MESSAGE_KEY = 'throttle:message';

export const ThrottleMessage = (message: string) => SetMetadata(THROTTLE_MESSAGE_KEY, message);
