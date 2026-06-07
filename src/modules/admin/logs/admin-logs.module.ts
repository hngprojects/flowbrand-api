import { Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminLogsListAction } from './actions/admin-logs-list.action';
import { AdminLogsController } from './admin-logs.controller';
import { AdminLogsService } from './admin-logs.service';

@Module({
  imports: [RedisModule, AdminAuthModule],
  controllers: [AdminLogsController],
  providers: [AdminLogsService, AdminLogsListAction],
})
export class AdminLogsModule {}
