import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppEvent } from '../constants/app-events';

/**
 * Wraps eventEmitter.emit in a try/catch so a synchronous listener throw
 * never propagates to the calling service (CONTRIBUTING.md §7, Rule 2).
 */
export function emitSafely(emitter: EventEmitter2, logger: Logger, eventName: AppEvent, payload: object): void {
  try {
    emitter.emit(eventName, payload);
  } catch (error) {
    logger.warn({ message: 'Domain event listener failed', eventName, error: (error as Error).message });
  }
}
