import { CanActivate, ConflictException, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as SYS_MSG from '../../../constants/system.messages';
import { RedisService } from '../../redis/redis.service';
import { SubscriptionModelAction } from '../actions/subscription.model-action';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class PaymentRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly subscriptionModelAction: SubscriptionModelAction,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const userId = request.user?.userId;

    // Check Pro status before incrementing the rate limit counter.
    // A user already on Pro gets 409 without burning their quota.
    const { payload: activeSubs } = await this.subscriptionModelAction.list({
      filterRecordOptions: { user_id: userId, status: SubscriptionStatus.ACTIVE },
      paginationPayload: { page: 1, limit: 1 },
    });
    if (activeSubs.length > 0) {
      throw new ConflictException(SYS_MSG.PAYMENT_USER_ALREADY_PRO);
    }

    const { exceeded } = await this.redisService.rateLimit(
      `ratelimit:payment-initiate:${userId}`,
      5,
      3600,
    );

    if (exceeded) {
      throw new HttpException(SYS_MSG.PAYMENT_RATE_LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
