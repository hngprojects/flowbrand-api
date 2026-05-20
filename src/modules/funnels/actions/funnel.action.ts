import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funnel } from '../entities/funnel.entity';
import { FunnelStatus } from '../enums/funnel-status.enum';

@Injectable()
export class FunnelModelAction extends AbstractModelAction<Funnel> {
  constructor(
    @InjectRepository(Funnel)
    private readonly funnelRepository: Repository<Funnel>,
  ) {
    super(funnelRepository, Funnel);
  }

  // Idempotency lookup. Returns the existing funnel if (user_id,
  // idempotency_key) already exists, otherwise null. The global UNIQUE
  // constraint on idempotency_key plus the user_id filter together prevent
  // cross-user reuse.
  async findByIdempotency(userId: string, idempotencyKey: string): Promise<Funnel | null> {
    return this.funnelRepository.findOne({
      where: { user_id: userId, idempotency_key: idempotencyKey },
    });
  }

  // Concurrent-generation guard. Returns the in-flight funnel for this user
  // (if any) so the caller can return 409 GENERATION_IN_PROGRESS.
  async findGeneratingForUser(userId: string): Promise<Funnel | null> {
    return this.funnelRepository.findOne({
      where: { user_id: userId, status: FunnelStatus.GENERATING },
    });
  }

  // Status endpoint helper. Returns funnel only if the caller owns it, so
  // cross-user polling falls through to 404 (SEC-01: do not reveal existence).
  async findOwnedById(funnelId: string, userId: string): Promise<Funnel | null> {
    return this.funnelRepository.findOne({
      where: { id: funnelId, user_id: userId },
    });
  }
}
