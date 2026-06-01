import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

interface LogActionPayload extends Record<string, unknown> {
  admin_id: string;
  action_type: 'profile_updated';
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LogService {
  constructor(private readonly logger: PinoLoggerService) {}

  async logAction(payload: LogActionPayload): Promise<void> {
    this.logger.info('admin.profile.action', payload);
  }
}
