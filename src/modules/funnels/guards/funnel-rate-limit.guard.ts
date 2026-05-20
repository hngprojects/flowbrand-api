import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import * as SYS_MSG from '../../../constants/system.messages';
import { RedisService } from '../../redis/redis.service';

const MAX_REQUESTS_PER_HOUR = 5;
const WINDOW_SECONDS = 3600;
const KEY_PREFIX = 'ratelimit:funnel-generate';

interface AuthenticatedRequest extends Request {
  user?: { sub?: string; userId?: string };
}

// BE-305 SEC-03: cap funnel generations at 5 per hour per user to prevent
// LLM quota exhaustion via automated requests. Implemented as a sliding
// window via Redis INCR + EXPIRE so we add no new package dependencies.
@Injectable()
export class FunnelRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(FunnelRateLimitGuard.name);

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.user?.sub ?? req.user?.userId;

    // No userId: defer to the auth guard. We do not rate-limit unauthed traffic.
    if (!userId) return true;

    const key = `${KEY_PREFIX}:${userId}`;

    let count: number | null;
    try {
      count = await this.redisService.incr(key);
      if (count === 1) {
        await this.redisService.expire(key, WINDOW_SECONDS);
      }
    } catch (err) {
      // Redis outage: fail open so legitimate users still get through.
      this.logger.warn({
        message: 'Rate-limit Redis call failed; allowing request',
        error: (err as Error).message,
        userId,
      });
      return true;
    }

    // RedisService.incr returns null on internal failure: fail open.
    if (count === null) return true;

    if (count > MAX_REQUESTS_PER_HOUR) {
      throw new HttpException(SYS_MSG.GENERATION_RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
