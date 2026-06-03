import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UsersModule } from '../../users/users.module';
import { User } from '../../users/entities/user.entity';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminProfileModelAction } from './actions/admin-profile.action';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';
import { LogService } from './services/log.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AdminAuthModule, UsersModule],
  controllers: [AdminProfileController],
  providers: [AdminProfileService, AdminProfileModelAction, RolesGuard, LogService],
})
export class AdminProfileModule {}
