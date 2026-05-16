import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpToken, OtpTokenType } from '../entities/otp-token.entity';

@Injectable()
export class OtpTokenModelAction extends AbstractModelAction<OtpToken> {
  constructor(
    @InjectRepository(OtpToken)
    repository: Repository<OtpToken>,
  ) {
    super(repository, OtpToken);
  }

  findByUserAndType(
    userId: string,
    type: OtpTokenType,
  ): Promise<OtpToken | null> {
    return this.get({ identifierOptions: { user_id: userId, type } });
  }
}
