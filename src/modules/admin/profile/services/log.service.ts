import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

interface LogActionPayload extends Record<string, unknown> {
  admin_id: string;
  action_type: 'profile_updated' | 'password_changed';
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
