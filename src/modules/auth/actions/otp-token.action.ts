import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpToken, OtpTokenType } from '../entities/otp-token.entity';

@Injectable()
export class OtpTokenModelAction extends AbstractModelAction<OtpToken> {
  constructor(
    @InjectRepository(OtpToken)
    private readonly otpRepository: Repository<OtpToken>,
  ) {
    super(otpRepository, OtpToken);
  }

  findByUserAndType(userId: string, type: OtpTokenType): Promise<OtpToken | null> {
    return this.get({ identifierOptions: { user_id: userId, type } });
  }

  replaceToken(payload: {
    user_id: string;
    type: OtpTokenType;
    token_hash: string;
    expires_at: Date;
  }): Promise<OtpToken> {
    return this.otpRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(OtpToken);
      await repo.delete({ user_id: payload.user_id, type: payload.type });
      return repo.save(repo.create(payload));
    });
  }
}
