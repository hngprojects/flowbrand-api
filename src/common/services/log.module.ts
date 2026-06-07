import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminLog } from '../../modules/admin/logs/entities/admin-log.entity';
import { LogService } from './log.service';

/**
 * Shared audit-logging module (BE-ADM-609). Import into any module whose
 * services need to record admin_logs entries via LogService.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AdminLog])],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
