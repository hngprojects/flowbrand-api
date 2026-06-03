import { Module } from '@nestjs/common';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminDashboardAction } from './actions/admin-dashboard.action';
import { RedisModule } from '../../redis/redis.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { UsersModule } from '../../users/users.module';
import { FunnelsModule } from '../../funnels/funnels.module';

@Module({
  imports: [RedisModule, AdminAuthModule, UsersModule, FunnelsModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService, AdminDashboardAction],
})
export class AdminDashboardModule {}