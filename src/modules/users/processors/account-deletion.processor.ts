import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';

export interface AccountDeletionPayload {
  userId: string;
  email: string;
}

export const ACCOUNT_DELETION_QUEUE = 'account-deletion';

@Processor(ACCOUNT_DELETION_QUEUE)
export class AccountDeletionProcessor {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly logger: PinoLoggerService,
  ) {}

  @Process('hard-delete')
  async handleHardDelete(job: Job<AccountDeletionPayload>): Promise<void> {
    const { userId, email } = job.data;

    this.logger.info('account.hard_delete.started', { userId });

    try {
      await this.dataSource.transaction(async (manager) => {
        // Delete in correct order (bottom-up to avoid FK constraint errors)

        await manager.query(
          `DELETE FROM stage_tasks WHERE stage_id IN (
            SELECT id FROM funnel_stages WHERE funnel_id IN (
              SELECT id FROM funnels WHERE user_id = $1
            )
          )`,
          [userId],
        );

        await manager.query(`DELETE FROM stage_feedback WHERE user_id = $1`, [userId]);

        await manager.query(
          `DELETE FROM funnel_stages WHERE funnel_id IN (
            SELECT id FROM funnels WHERE user_id = $1
          )`,
          [userId],
        );

        await manager.query(`DELETE FROM funnels WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM wizard_sessions WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM uploaded_documents WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM otp_tokens WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM auth_metadata WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM users WHERE id = $1`, [userId]);
      });

      this.logger.info('account.hard_delete.completed', { userId, email });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('account.hard_delete.failed', { 
        userId, 
        email, 
        error: errorMessage,
        attempt: job.attemptsMade 
      });
      throw error;
    }
  }
}