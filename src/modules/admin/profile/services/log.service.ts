import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { AdminProfileActionType } from '../enums/admin-profile-action-type.enum';

interface LogActionPayload extends Record<string, unknown> {
  admin_id: string;
  action_type: AdminProfileActionType;
  status: 'success' | 'failed';
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LogService {
  constructor(private readonly logger: PinoLoggerService) {}

  logAction(payload: LogActionPayload): Promise<void> {
    this.logger.info('admin.profile.action', payload);
    return Promise.resolve();
  }
}
