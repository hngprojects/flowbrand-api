import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import { User } from '../entities/user.entity';
import { UserSession } from '../entities/user-session.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { WizardSession } from '../../onboarding/entities/wizzard-session.entity';
import { UploadedDocument } from '../../upload/entities/uploaded-document.entity';
import { Funnel } from '../../funnels/entities/funnel.entity';
import { FunnelStage } from '../../funnels/entities/funnel-stage.entity';
import { StageTask } from '../../funnels/entities/stage-task.entity';
import { StageFeedback } from '../../funnels/entities/stage-feedback.entity';
import { OtpToken } from '../../auth/entities/otp-token.entity';
import { AuthMetadata } from '../../auth/entities/auth-metadata.entity';

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
        // Resolve IDs needed for child deletions
        const funnels = await manager.find(Funnel, {
          where: { user_id: userId },
          select: ['id'],
        });
        const funnelIds = funnels.map(f => f.id);

        const stageIds: string[] = [];
        if (funnelIds.length > 0) {
          const stages = await manager.find(FunnelStage, {
            where: { funnel_id: In(funnelIds) },
            select: ['id'],
          });
          stageIds.push(...stages.map(s => s.id));
        }

        // 1. stage_tasks (deepest child — must go first)
        if (stageIds.length > 0) {
          await manager.delete(StageTask, { stage_id: In(stageIds) });
        }

        await manager.delete(StageFeedback, { user_id: userId });

        if (funnelIds.length > 0) {
          await manager.delete(FunnelStage, { funnel_id: In(funnelIds) });
        }

        await manager.delete(Funnel, { user_id: userId });
        await manager.delete(WizardSession, { user_id: userId });

        // 6. uploaded_documents
        await manager.delete(UploadedDocument, { user_id: userId });
        await manager.delete(OtpToken, { user_id: userId });
        await manager.delete(AuthMetadata, { user_id: userId });

        // TODO: Delete notification_preferences here once entity exists
        
        await manager.delete(UserSession, { user_id: userId });
        await manager.delete(UserRoleEntity, { user_id: userId });
        await manager.delete(User, { id: userId });
      });

      this.logger.info('account.hard_delete.completed', { userId, email });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('account.hard_delete.failed', {
        userId,
        email,
        error: errorMessage,
        attempt: job.attemptsMade,
      });
      throw error;
    }
  }
}