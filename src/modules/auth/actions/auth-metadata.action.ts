import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthMetadata } from './../entities/auth-metadata.entity';

@Injectable()
export class AuthMetadataModelAction extends AbstractModelAction<AuthMetadata> {
  constructor(
    @InjectRepository(AuthMetadata)
    repository: Repository<AuthMetadata>,
  ) {
    super(repository, AuthMetadata);
  }

  async findByUserId(userId: string): Promise<AuthMetadata | null> {
    return await this.get({ identifierOptions: { user_id: userId } });
  }

  async updateByUserId(
    userId: string,
    updatePayload: Partial<AuthMetadata>,
  ): Promise<AuthMetadata | null> {
    return await this.update({
      identifierOptions: { user_id: userId },
      updatePayload,
      transactionOptions: { useTransaction: false },
    });
  }

  async createForUser(
    createPayload: Partial<AuthMetadata>,
  ): Promise<AuthMetadata> {
    return await this.create({
      createPayload,
      transactionOptions: { useTransaction: false },
    });
  }

  async incrementFailedAttempts(userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ failed_attempts: () => 'failed_attempts + 1' })
      .where('user_id = :userId', { userId })
      .returning('failed_attempts')
      .execute();
    return (result.raw[0] as { failed_attempts: number })?.failed_attempts ?? 1;
  }
}
