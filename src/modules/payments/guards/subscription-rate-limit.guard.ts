import { CanActivate, ConflictException, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as SYS_MSG from '../../../constants/system.messages';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RedisService } from '../../redis/redis.service';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

@Injectable()
export class SubscriptionRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly subscriptionModelAction: SubscriptionModelAction,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const userId = request.user?.userId;

    // Check ACTIVE and PENDING before incrementing the rate limit counter.
    // The partial unique index blocks a second pending/active sub at the DB level,
    // but checking here gives a clean 409 without burning the user's rate-limit quota.
    const { payload: existing } = await this.subscriptionModelAction.list({
      filterRecordOptions: [
        { user_id: userId, status: SubscriptionStatus.ACTIVE },
        { user_id: userId, status: SubscriptionStatus.PENDING },
      ],
      paginationPayload: { page: 1, limit: 1 },
    });

    if (existing.length > 0) {
      throw new ConflictException(SYS_MSG.SUBSCRIPTION_USER_ALREADY_SUBSCRIBED);
    }

    const { exceeded } = await this.redisService.rateLimit(
      `ratelimit:subscription-initiate:${userId}`,
      5,
      3600,
    );

    if (exceeded) {
      throw new HttpException(SYS_MSG.SUBSCRIPTION_RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
